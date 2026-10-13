import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox']
        )
        page = await browser.new_page()
        await page.goto("http://127.0.0.1:3000/", timeout=30000)

        # wait for loaded
        for _ in range(40):
            ready = await page.evaluate("() => Boolean(window.__PINBALL_MESHES__ && window.__PINBALL_MESHES__.length > 0)")
            if ready: break
            await asyncio.sleep(0.5)

        info = await page.evaluate("""() => {
            const res = [];
            window.scene = window.scene || null;
            // Let's find meshes in scene
            return window.__PINBALL_MESHES__.filter(m => m.name.toLowerCase().includes('flipper') || m.name.toLowerCase().includes('shooter'));
        }""")
        print("Flippers & Shooter info:")
        for item in info:
            print(item)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
