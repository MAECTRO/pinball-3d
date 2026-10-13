import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        # Launch chromium with WebGL enabled
        browser = await p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True,
            args=[
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--enable-webgl',
                '--no-sandbox'
            ]
        )
        page = await browser.new_page()

        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[PAGE_ERROR] {err}"))

        print("Navigating to http://127.0.0.1:3000/ ...")
        await page.goto("http://127.0.0.1:3000/", timeout=30000)

        # Wait up to 20 seconds for window.__PINBALL_MESHES__
        for _ in range(40):
            has_meshes = await page.evaluate("() => Boolean(window.__PINBALL_MESHES__ && window.__PINBALL_MESHES__.length > 0)")
            if has_meshes:
                break
            await asyncio.sleep(0.5)

        meshes = await page.evaluate("() => window.__PINBALL_MESHES__ || []")
        print(f"Captured {len(meshes)} meshes/groups from FBX!")

        with open("fbx_meshes.json", "w", encoding="utf-8") as f:
            json.dump(meshes, f, indent=2, ensure_ascii=False)

        await page.screenshot(path="screenshot_initial.png")
        print("Saved screenshot to screenshot_initial.png")

        print("--- Console logs (last 20) ---")
        for log in console_logs[-20:]:
            print(log)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
