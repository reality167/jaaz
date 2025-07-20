import os
import sys
import io
# Ensure stdout and stderr use utf-8 encoding to prevent emoji logs from crashing python server
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# 加载环境变量
try:
    from dotenv import load_dotenv
    # 尝试从多个位置加载.env文件
    env_paths = [
        os.path.join(os.path.dirname(__file__), '.env'),  # 当前目录
        os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'),  # 上级目录
        os.path.join(os.path.dirname(__file__), '_internal', '.env'),  # _internal目录（打包后）
        '.env'  # 根目录
    ]
    
    for env_path in env_paths:
        if os.path.exists(env_path):
            load_dotenv(env_path)
            print(f"🌟 已加载环境变量文件: {env_path}")
            break
    else:
        print("⚠️  未找到.env文件，将使用系统环境变量")
except ImportError:
    print("⚠️  python-dotenv未安装，将使用系统环境变量")

from routers import config, agent, workspace, image_tools, canvas, ssl_test, chat_router, settings, layer_split
import routers.websocket_router
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
import asyncio
import argparse
from contextlib import asynccontextmanager
from starlette.types import Scope
from starlette.responses import Response
import socketio
from services.websocket_state import sio

root_dir = os.path.dirname(__file__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # onstartup
    await agent.initialize()
    yield
    # onshutdown

app = FastAPI(lifespan=lifespan)

# Include routers
app.include_router(config.router)
app.include_router(settings.router)
app.include_router(agent.router)
app.include_router(canvas.router)
app.include_router(workspace.router)
app.include_router(image_tools.router)
app.include_router(ssl_test.router)
app.include_router(chat_router.router)
app.include_router(layer_split.router)

# Mount the React build directory
react_build_dir = os.environ.get('UI_DIST_DIR', os.path.join(
    os.path.dirname(root_dir), "react", "dist"))


# 无缓存静态文件类
class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


static_site = os.path.join(react_build_dir, "assets")
if os.path.exists(static_site):
    app.mount("/assets", NoCacheStaticFiles(directory=static_site), name="assets")


@app.get("/")
async def serve_react_app():
    response = FileResponse(os.path.join(react_build_dir, "index.html"))
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


socket_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path='/socket.io')

if __name__ == "__main__":
    # bypas localhost request for proxy, fix ollama proxy issue
    _bypass = {"127.0.0.1", "localhost", "::1"}
    current = set(os.environ.get("no_proxy", "").split(",")) | set(
        os.environ.get("NO_PROXY", "").split(","))
    os.environ["no_proxy"] = os.environ["NO_PROXY"] = ",".join(
        sorted(_bypass | current - {""}))

    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=57988,
                        help='Port to run the server on')
    args = parser.parse_args()
    import uvicorn
    print("🌟Starting server, UI_DIST_DIR:", os.environ.get('UI_DIST_DIR'))

    uvicorn.run(socket_app, host="127.0.0.1", port=args.port)
