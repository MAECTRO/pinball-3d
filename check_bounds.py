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

        for _ in range(40):
            ready = await page.evaluate("() => Boolean(window.__PINBALL_MESHES__ && window.__PINBALL_MESHES__.length > 0)")
            if ready: break
            await asyncio.sleep(0.5)

        table_bounds = await page.evaluate("""() => {
            // Find PlayField mesh
            const meshes = window.__PINBALL_MESHES__;
            const pf = meshes.find(m => m.name.toLowerCase() === 'playfield');
            return {
                pf,
                total: meshes.length
            };
        }""")
        print("Table bounds info:", table_bounds)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
