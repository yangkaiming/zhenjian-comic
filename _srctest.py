"""dm5 完整取图流程：章节页 -> 签名 -> chapterfun.ashx -> 验证图片。"""
import asyncio
import re

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"


async def main() -> None:
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as c:
        r = await c.get("https://www.dm5.com/m1844147/", headers={"User-Agent": UA, "Referer": "https://www.dm5.com/"})
        h = r.text
        sign = re.search(r'DM5_VIEWSIGN="([0-9a-f]+)"', h).group(1)
        dt = re.search(r'DM5_VIEWSIGN_DT="([^"]+)"', h).group(1)
        cid = re.search(r"DM5_CID=(\d+)", h).group(1)
        mid = re.search(r"DM5_MID=(\d+)", h).group(1)
        count = re.search(r"DM5_IMAGE_COUNT=(\d+)", h).group(1)
        print(f"cid={cid} mid={mid} pages={count} sign={sign[:12]}... dt={dt}")

        rr = await c.get(
            "https://www.dm5.com/chapterfun.ashx",
            params={
                "cid": cid, "page": "1", "key": "", "language": "1", "gtk": "6",
                "_cid": cid, "_mid": mid, "_dt": dt, "_sign": sign,
            },
            headers={"User-Agent": UA, "Referer": f"https://www.dm5.com/m{cid}/"},
        )
        print("chapterfun ->", rr.status_code, rr.headers.get("content-type", ""))
        print("body:", rr.text[:500])
        urls = re.findall(r'https?://[^"\'\s\\]+\.(?:jpg|jpeg|png|webp)', rr.text)
        print("\n图片 URL 数:", len(urls))
        if urls:
            print("样本:", urls[:3])
            img = await c.get(urls[0], headers={"User-Agent": UA, "Referer": "https://www.dm5.com/"})
            print("首图:", img.status_code, img.headers.get("content-type"), len(img.content), "bytes")


asyncio.run(main())
