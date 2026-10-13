import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True,
            args=[
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--enable-webgl',
                '--no-sandbox',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        )
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        console_errors = []
        console_logs = []
        page.on("console", lambda msg: (
            console_errors.append(msg.text) if msg.type == "error" else console_logs.append(f"[{msg.type}] {msg.text}")
        ))
        page.on("pageerror", lambda err: console_errors.append(f"PAGE_ERROR: {err}"))

        print("1. Opening http://127.0.0.1:3000/ ...")
        await page.goto("http://127.0.0.1:3000/", timeout=30000)

        # Wait for game bootstrap
        print("2. Waiting for game bootstrap and model loading...")
        await page.wait_for_function(
            "() => Boolean(window.gameManager && window.physicsManager && window.physicsManager.ballBody)",
            timeout=30000
        )
        print("Game initialized successfully!")

        # 2. Check mesh count
        mesh_count = await page.evaluate("() => window.__PINBALL_MESHES__ ? window.__PINBALL_MESHES__.length : 0")
        print(f"Verified mesh count logged to console.table: {mesh_count}")
        assert mesh_count > 0, "No meshes captured in console.table!"

        # 3. Check ball position in shooter lane
        ball_pos = await page.evaluate("() => window.physicsManager.ballBody.translation()")
        print("Initial Ball Position:", ball_pos)
        assert ball_pos['x'] > 4.0, f"Ball not in shooter lane! Pos: {ball_pos}"

        await page.screenshot(path="verify_01_table_ready.png")
        print("Saved verify_01_table_ready.png")

        # 4. Test F1 Debug Mode
        print("4. Testing F1 Debug Mode...")
        await page.click("body")
        await page.keyboard.press("F1")
        await page.wait_for_function("() => window.physicsManager.debugVisible === true")
        debug_active = await page.evaluate("() => window.physicsManager.debugVisible")
        print("Debug colliders active (F1):", debug_active)
        assert debug_active == True, "F1 debug mode toggle failed!"
        await page.screenshot(path="verify_02_debug_colliders.png")
        print("Saved verify_02_debug_colliders.png")
        await page.keyboard.press("F1") # toggle off
        await page.wait_for_function("() => window.physicsManager.debugVisible === false")

        # 5. Test Left Flipper Controls
        print("5. Testing Left Flipper (KeyA)...")
        await page.keyboard.down("KeyA")
        await page.wait_for_function("() => window.physicsManager.leftAngle > 0.4", timeout=3000)
        left_angle = await page.evaluate("() => window.physicsManager.leftAngle")
        print(f"Left Flipper rotated to: {left_angle:.3f} rad")
        await page.keyboard.up("KeyA")
        await page.wait_for_function("() => window.physicsManager.leftAngle < 0.1", timeout=3000)

        # 6. Test Right Flipper Controls
        print("6. Testing Right Flipper (KeyD)...")
        await page.keyboard.down("KeyD")
        await page.wait_for_function("() => window.physicsManager.rightAngle > 0.4", timeout=3000)
        right_angle = await page.evaluate("() => window.physicsManager.rightAngle")
        print(f"Right Flipper rotated to: {right_angle:.3f} rad")
        await page.keyboard.up("KeyD")
        await page.wait_for_function("() => window.physicsManager.rightAngle < 0.1", timeout=3000)

        # 7. Test Plunger Launch
        print("7. Testing Plunger Launch (Holding Space)...")
        await page.keyboard.down("Space")
        power = 0
        for _ in range(40):
            await asyncio.sleep(0.1)
            power = await page.evaluate("() => window.gameManager.plungerPower")
            if power > 0.45:
                break

        power_bar = await page.evaluate("() => document.getElementById('ui-plunger-bar').style.height")
        print(f"Plunger charged power: {power:.2f}, power bar: {power_bar}")
        assert power > 0.2, f"Plunger did not charge power! Power: {power}"

        await page.keyboard.up("Space")
        print("Plunger released!")

        # Wait for ball to be propelled up the shooter lane
        ball_launched = False
        new_ball_pos = None
        for _ in range(30):
            await asyncio.sleep(0.1)
            new_ball_pos = await page.evaluate("() => window.physicsManager.ballBody.translation()")
            if new_ball_pos['z'] < 14.0:
                ball_launched = True
                break

        print("Ball Position after launch:", new_ball_pos)
        assert ball_launched, f"Ball was not propelled up table! Pos: {new_ball_pos}"
        await page.screenshot(path="verify_03_ball_in_play.png")
        print("Saved verify_03_ball_in_play.png")

        # 8. Test Scoring & Bumper Hit
        print("8. Testing Scoring & Bumper Hit...")
        initial_score = await page.evaluate("() => window.gameManager.score")
        await page.evaluate("""() => {
            const b = window.physicsManager.bumpers[0];
            window.physicsManager.ballBody.setTranslation({ x: b.x, y: b.y, z: b.z }, true);
        }""")
        await page.wait_for_function("() => window.gameManager.score > 0", timeout=3000)
        new_score = await page.evaluate("() => window.gameManager.score")
        print(f"Score before: {initial_score}, Score after bumper: {new_score}")
        assert new_score > initial_score, "Bumper did not award score!"

        # 9. Test Drain & Game Over
        print("9. Testing Drain & Game Over...")
        await page.evaluate("() => { window.gameManager.balls = 1; window.physicsManager.onDrain(); }")
        await page.wait_for_function("() => window.gameManager.isGameOver === true", timeout=3000)
        is_over = await page.evaluate("() => window.gameManager.isGameOver")
        print("Game Over triggered:", is_over)
        assert is_over == True, "Game Over was not triggered on 0 balls!"
        await page.screenshot(path="verify_04_gameover_modal.png")
        print("Saved verify_04_gameover_modal.png")

        # 10. Test Rewarded Ad Extra Ball Revive
        print("10. Testing Rewarded Ad Revive button...")
        await page.click("#btn-ad-revive")
        await page.wait_for_function("() => window.gameManager.isGameOver === false", timeout=3000)
        resumed_balls = await page.evaluate("() => window.gameManager.balls")
        is_over_now = await page.evaluate("() => window.gameManager.isGameOver")
        print(f"Balls after rewarded ad: {resumed_balls}, GameOver: {is_over_now}")
        assert resumed_balls == 1 and not is_over_now, "Rewarded ad revive failed!"

        # 11. Test Mobile Touch Buttons
        print("11. Testing Mobile Touch Buttons...")
        await page.evaluate("""() => {
            const btnLeft = document.getElementById('touch-flipper-left');
            btnLeft.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        }""")
        await page.wait_for_function("() => window.physicsManager.leftAngle > 0.4", timeout=3000)
        touch_left_angle = await page.evaluate("() => window.physicsManager.leftAngle")
        print(f"Touch Left Flipper Angle: {touch_left_angle:.3f} rad")
        assert touch_left_angle > 0.4, "Touch flipper button failed!"

        await page.evaluate("""() => {
            const btnLeft = document.getElementById('touch-flipper-left');
            btnLeft.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        }""")
        await page.wait_for_function("() => window.physicsManager.leftAngle < 0.1", timeout=3000)

        print("\n=======================================================")
        print(">>> ALL 11 VERIFICATION TESTS PASSED FLAWLESSLY! <<<")
        print("=======================================================")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
