from playwright.sync_api import sync_playwright

def verify_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Since we are running electron, we can't easily connect to the window in this environment
        # without more complex setup. However, the `npm run dev` typically launches a Vite dev server.
        # electron-vite usually exposes the renderer at a local port.
        # Let's try to find the port or just assume standard Vite port 5173.

        # In Electron-Vite, the renderer is served by Vite.
        page = browser.new_page()
        try:
            page.goto("http://localhost:5173")
            page.wait_for_selector('text=AI Editor', timeout=10000)

            # Take screenshot of Dashboard
            page.screenshot(path="verification_dashboard.png")
            print("Dashboard screenshot taken.")

            # Click on 'Video Prompts'
            page.click('text=Video Prompts')
            page.wait_for_timeout(1000)
            page.screenshot(path="verification_prompts.png")
            print("Prompts screenshot taken.")

            # Click on 'Image Gen'
            page.click('text=Image Gen')
            page.wait_for_timeout(1000)
            page.screenshot(path="verification_images.png")
            print("Images screenshot taken.")

             # Click on 'Auto Video'
            page.click('text=Auto Video')
            page.wait_for_timeout(1000)
            page.screenshot(path="verification_video.png")
            print("Video screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_app()
