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
            ready = await page.evaluate("() => Boolean(window.pinballFBX)")
            if ready: break
            await asyncio.sleep(0.5)

        res = await page.evaluate("""() => {
            let leftMesh = null, rightMesh = null;
            let leftRubber = null, rightRubber = null;
            window.pinballFBX.traverse(obj => {
                const n = obj.name.toLowerCase();
                if (n === 'flipper001') leftMesh = obj;
                if (n === 'flipperrubber001') leftRubber = obj;
                if (n === 'flipper') rightMesh = obj;
                if (n === 'flipperrubber') rightRubber = obj;
            });

            function getInfo(obj) {
                if (!obj) return null;
                const wp = new THREE.Vector3();
                obj.getWorldPosition(wp);
                const wq = new THREE.Quaternion();
                obj.getWorldQuaternion(wq);
                const eul = new THREE.Euler().setFromQuaternion(wq);
                return {
                    name: obj.name,
                    parent: obj.parent ? obj.parent.name : null,
                    worldPos: { x: wp.x, y: wp.y, z: wp.z },
                    worldRot: { x: eul.x, y: eul.y, z: eul.z }
                };
            }

            return {
                leftMesh: getInfo(leftMesh),
                leftRubber: getInfo(leftRubber),
                rightMesh: getInfo(rightMesh),
                rightRubber: getInfo(rightRubber)
            };
        }""")
        import json
        print(json.dumps(res, indent=2))
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
