"""探测 TranSmart 会话获取方式。"""
import asyncio

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"


async def main() -> None:
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as c:
        # 1) 常见会话端点
        for url in [
            "https://transmart.qq.com/api/imtSession?client_key=scihub",
            "https://transmart.qq.com/api/imt/session?client_key=scihub",
        ]:
            try:
                r = await c.get(url, headers={"User-Agent": UA, "Referer": "https://transmart.qq.com/"})
                print(f"GET {url}: {r.status_code} {r.text[:120]}")
            except Exception as e:
                print(f"GET {url}: FAILED {type(e).__name__}")
        # 2) 通过 imt 的 fn 取会话
        for fn in ["session_init", "get_session", "init_session"]:
            try:
                r = await c.post(
                    "https://transmart.qq.com/api/imt",
                    json={"header": {"fn": fn, "client_key": "scihub"}, "type": "trans", "source": {"lang": "en", "text": ""}},
                    headers={"User-Agent": UA, "Referer": "https://transmart.qq.com/"},
                )
                print(f"fn={fn}: {r.status_code} {r.text[:150]}")
            except Exception as e:
                print(f"fn={fn}: FAILED {type(e).__name__}")
            await asyncio.sleep(1)


asyncio.run(main())
