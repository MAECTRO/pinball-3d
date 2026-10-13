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

        test_rot = await page.evaluate("""() => {
            let left = null, right = null, leftChild = null;
            window.pinballFBX.traverse(obj => {
                if (obj.name.toLowerCase() === 'flipperrubber001') left = obj;
                if (obj.name.toLowerCase() === 'flipper001') leftChild = obj;
                if (obj.name.toLowerCase() === 'flipper') right = obj;
            });

            // Get initial child positions
            const leftChildPos0 = new THREE.Vector3();
            leftChild.getWorldPosition(leftChildPos0);

            // Rotate left by +0.5 rad
            const origRotLeft = left.rotation.y;
            left.rotation.y += 0.5;
            left.updateWorldMatrix(true, true);
            const leftChildPosPlus = new THREE.Vector3();
            leftChild.getWorldPosition(leftChildPosPlus);

            // Restore
            left.rotation.y = origRotLeft;
            left.updateWorldMatrix(true, true);

            // Rotate right by +0.5 rad
            const origRotRight = right.rotation.y;
            const rightChild = right.children[0];
            const rightChildPos0 = new THREE.Vector3();
            rightChild.getWorldPosition(rightChildPos0);

            right.rotation.y += 0.5;
            right.updateWorldMatrix(true, true);
            const rightChildPosPlus = new THREE.Vector3();
            rightChild.getWorldPosition(rightChildPosPlus);

            right.rotation.y = origRotRight;
            right.updateWorldMatrix(true, true);

            return {
                left: {
                    initialZ: leftChildPos0.z,
                    plusRotZ: leftChildPosPlus.z,
                    dz: leftChildPosPlus.z - leftChildPos0.z
                },
                right: {
                    initialZ: rightChildPos0.z,
                    plusRotZ: rightChildPosPlus.z,
                    dz: rightChildPosPlus.z - rightChildPos0.z
                }
            };
        }""")
        print("Flipper rotation direction test:", test_rot)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
