"""Cliente mínimo do serviço CLI do UXP Developer Tools (ws://127.0.0.1:14001/socket/cli).

Carrega ou lista plugins no Photoshop sem clique no UDT. Protocolo extraído do app.asar
do UDT em 06/10/2026: o serviço anuncia apps com `didAddRuntimeClient` e repassa
`{command:"proxy", clientId, requestId, message}` ao app.

uso: python udt_cli.py list
     python udt_cli.py load [caminho_do_manifest_dir]
"""
import sys, io, json, time
import websocket

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
URL = "ws://127.0.0.1:14001/socket/cli"
PLUGIN_DIR = "D:/ClaudeCode/adb-mcp/uxp/ps"


def main():
    acao = sys.argv[1] if len(sys.argv) > 1 else "list"
    ws = websocket.create_connection(URL, timeout=10)
    apps, fim = [], time.time() + 3
    while time.time() < fim:
        try:
            m = json.loads(ws.recv())
        except websocket.WebSocketTimeoutException:
            break
        except Exception:
            break
        if m.get("command") == "didAddRuntimeClient":
            apps.append(m)
        if m.get("command") == "didCompleteConnection":
            ws.settimeout(1.5)
    ps = [a for a in apps if "PS" in json.dumps(a.get("app", {})).upper()]
    print("apps:", json.dumps(apps, ensure_ascii=False)[:600])
    if not ps:
        print("Photoshop não anunciado pelo serviço")
        return
    cid = ps[0]["id"]
    if acao == "list":
        msg = {"command": "Plugin", "action": "list"}
    else:
        path = sys.argv[2] if len(sys.argv) > 2 else PLUGIN_DIR
        man = json.load(open(path + "/manifest.json", encoding="utf-8"))
        msg = {"command": "Plugin", "action": "load",
               "params": {"provider": {"type": "disk", "id": man["id"], "path": path}},
               "breakOnStart": False}
    ws.settimeout(15)
    ws.send(json.dumps({"command": "proxy", "clientId": cid, "requestId": 1, "message": msg}))
    fim = time.time() + 15
    while time.time() < fim:
        try:
            r = json.loads(ws.recv())
        except Exception as e:
            print("sem resposta:", e)
            break
        if r.get("requestId") == 1 or r.get("command") == "reply":
            print(json.dumps(r, ensure_ascii=False))
            break
    ws.close()


if __name__ == "__main__":
    main()
