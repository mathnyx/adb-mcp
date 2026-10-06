// Comandos acrescentados em 2026-10-02 (sessão curso-de-inverno_final):
// a API UXP do Premiere 26 não tem transição de áudio, então o crossfade
// é substituído por micro-fades de volume em keyframe nas bordas de cada clipe.

const app = require("premierepro");
const constants = require("premierepro").Constants;
const utils = require("./utils.js");
const { TRACK_TYPE } = require("./consts.js");
const { _getSequenceFromId, execute } = utils;

const TPS = 254016000000;
const tt = (sec) => app.TickTime.createWithTicks(String(Math.round(sec * TPS)));

// Roda código JS arbitrário com acesso a app/constants/utils.
// Exige "allowCodeGenerationFromStrings" no manifest.
const executeScript = async (command) => {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const f = new AsyncFunction("app", "constants", "utils", "TRACK_TYPE", command.options.code);
    const result = await f(app, constants, utils, TRACK_TYPE);
    return { result: result === undefined ? null : JSON.parse(JSON.stringify(result)) };
};

const _audioItems = async (sequence, trackIndex) => {
    const track = await sequence.getAudioTrack(trackIndex);
    return await track.getTrackItems(1, false);
};

const _volumeParam = async (item, componentIndex, paramIndex) => {
    const chain = await item.getComponentChain();
    const n = chain.getComponentCount();
    if (componentIndex !== undefined && componentIndex !== null) {
        return chain.getComponentAtIndex(componentIndex).getParam(paramIndex || 0);
    }
    for (let i = 0; i < n; i++) {
        const c = chain.getComponentAtIndex(i);
        const pc = c.getParamCount();
        for (let j = 0; j < pc; j++) {
            const p = c.getParam(j);
            if (/^(level|n[ií]vel)$/i.test(p.displayName || "")) return p;
        }
    }
    throw new Error("parametro de volume nao encontrado");
};

const inspectAudioClips = async (command) => {
    const o = command.options;
    const sequence = await _getSequenceFromId(o.sequenceId);
    const items = await _audioItems(sequence, o.audioTrackIndex || 0);
    const out = [];
    for (const idx of o.indices) {
        const it = items[idx];
        const rec = {
            index: idx,
            start: (await it.getStartTime()).seconds,
            end: (await it.getEndTime()).seconds,
            inPoint: (await it.getInPoint()).seconds,
            outPoint: (await it.getOutPoint()).seconds,
            components: [],
        };
        const chain = await it.getComponentChain();
        const n = chain.getComponentCount();
        for (let i = 0; i < n; i++) {
            const c = chain.getComponentAtIndex(i);
            const comp = { i, matchName: await c.getMatchName(), displayName: await c.getDisplayName(), params: [] };
            const pc = c.getParamCount();
            for (let j = 0; j < pc; j++) {
                const p = c.getParam(j);
                const prm = { j, name: p.displayName };
                try { prm.start = (await p.getStartValue()).value; } catch (e) { prm.start = `erro ${e}`; }
                try { prm.timeVarying = p.isTimeVarying(); } catch (e) {}
                try { prm.keyframes = p.getKeyframeListAsTickTimes().map((t) => t.seconds); } catch (e) {}
                if (o.probeTimes && prm.keyframes && prm.keyframes.length) {
                    prm.probe = {};
                    for (const s of o.probeTimes) {
                        try { prm.probe[s] = await p.getValueAtTime(tt(s)); } catch (e) { prm.probe[s] = `erro ${e}`; }
                    }
                }
                comp.params.push(prm);
            }
            rec.components.push(comp);
        }
        out.push(rec);
    }
    return { clips: out };
};

// Fade de entrada e de saída em cada clipe indicado.
// timeMode: "source" (keyframe em tempo de mídia), "sequence" ou "zero" (relativo ao clipe).
const fadeAudioEdges = async (command) => {
    const o = command.options;
    const project = await app.Project.getActiveProject();
    const sequence = await _getSequenceFromId(o.sequenceId);
    const items = await _audioItems(sequence, o.audioTrackIndex || 0);
    const fade = o.fadeSeconds;
    const silent = o.silentValue !== undefined ? o.silentValue : 0;
    const indices = o.indices || items.map((_, k) => k);
    const done = [];
    for (const idx of indices) {
        const it = items[idx];
        const p = await _volumeParam(it, o.componentIndex, o.paramIndex);
        const full = o.fullValue !== undefined ? o.fullValue : (await p.getStartValue()).value;
        let a, b;
        if (o.timeMode === "sequence") {
            a = (await it.getStartTime()).seconds; b = (await it.getEndTime()).seconds;
        } else if (o.timeMode === "zero") {
            a = 0; b = (await it.getDuration()).seconds;
        } else {
            a = (await it.getInPoint()).seconds; b = (await it.getOutPoint()).seconds;
        }
        const pts = [];
        if (o.fadeIn !== false && idx !== 0) pts.push([a, silent], [a + fade, full]);
        else pts.push([a, full]);
        if (o.fadeOut !== false && idx !== items.length - 1) pts.push([b - fade, full], [b, silent]);
        else pts.push([b, full]);
        const kfs = pts.map(([t, v]) => { const k = p.createKeyframe(v); k.position = tt(t); return k; });
        execute(() => {
            const acts = [];
            if (!p.isTimeVarying()) acts.push(p.createSetTimeVaryingAction(true));
            for (const k of kfs) acts.push(p.createAddKeyframeAction(k));
            return acts;
        }, project);
        done.push(idx);
    }
    return { done: done.length };
};

// Insere [inSec, outSec] do item de projeto na posição atSec, empurrando o resto.
const insertSourceRange = async (command) => {
    const o = command.options;
    const project = await app.Project.getActiveProject();
    const sequence = await _getSequenceFromId(o.sequenceId);
    const item = await utils.findProjectItem(o.itemName, project);
    const clip = app.ClipProjectItem.cast(item);
    const editor = await app.SequenceEditor.getEditor(sequence);
    execute(() => [clip.createSetInOutPointsAction(tt(o.inSec), tt(o.outSec))], project);
    execute(() => [editor.createInsertProjectItemAction(item, tt(o.atSec), o.videoTrackIndex || 0, o.audioTrackIndex || 0, false)], project);
    if (o.clearAfter !== false) execute(() => [clip.createClearInOutPointsAction()], project);
    return { ok: true };
};

module.exports = {
    commandHandlers: { executeScript, inspectAudioClips, fadeAudioEdges, insertSourceRange },
};
