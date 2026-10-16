"""dm5 图片防盗链测试：cookie + 不同 Referer 组合。"""
import asyncio
import re

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"

IMG = "https://manhua1032-223-111-182-10.cdndm5.com/34/33991/518896/14_4664.jpg?cid=518896&key=53fc026e63c03b90d83ed2d5e84d6f93"


async def main() -> None:
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as c:
        # 先访问章节页拿 cookie
        r = await c.get("https://www.dm5.com/m518896/", headers={"User-Agent": UA})
        print("章节页 cookies:", dict(c.cookies))
        combos = [
            {"Referer": "https://www.dm5.com/m518896/"},
            {"Referer": "https://www.dm5.com/"},
            {"Referer": "https://manhua1032-223-111-182-10.cdndm5.com/"},
            {"Referer": "https://www.dm5.com/m518896/", "Accept": "image/avif,image/webp,image/*,*/*"},
            {},
        ]
        for hdrs in combos:
            try:
                rr = await c.get(IMG, headers={"User-Agent": UA, **hdrs})
                print(f"{hdrs.get('Referer', '(无)'):<55} -> {rr.status_code} {len(rr.content)}B {rr.headers.get('content-type','')[:20]}")
            except Exception as e:
                print(f"{hdrs.get('Referer', '(无)'):<55} -> FAILED {type(e).__name__}")
            await asyncio.sleep(0.5)
        # 去掉 query 试试
        base = IMG.split("?")[0]
        rr = await c.get(base, headers={"User-Agent": UA, "Referer": "https://www.dm5.com/m518896/"})
        print(f"{'(无 query)':<55} -> {rr.status_code} {len(rr.content)}B")


asyncio.run(main())
