# MENUVERSE implementation plan

MENUVERSE turns the QR code on a restaurant table into an interactive menu. Customers browse dishes and turn each one around with a finger before they order. The first pilot is Swiss Butter. The platform is built so other restaurants can join later without a custom build each time.

## Milestones

Each milestone ships something that works, is tested on real phones, and keeps everything from earlier milestones working.

| # | Milestone | What exists at the end | Status |
|---|-----------|------------------------|--------|
| 1 | **Customer demo** | Mobile web menu for a sample restaurant: categories, dish page with price, description, ingredients and allergens, and a drag-to-rotate 360° viewer. Static files only. | **Done (this folder)** |
| 2 | **Swiss Butter content pilot** | The same app with Swiss Butter's approved dishes, prices, allergens and photos. Real 360° sequences for 2 or 3 signature dishes from a photo session. Hosted on a real URL, with a QR code printed for one table. | Waiting for approved content |
| 3 | **Real hosting and QR codes** | Production domain, `/r/<restaurant>?table=<n>` links, a QR generator per table, an image CDN, and basic analytics (menu opened, dish viewed, rotations). | Planned |
| 4 | **Staff menu editor** | Login for restaurant staff. Edit dish names, descriptions, prices, categories, availability ("sold out tonight") and images without a developer. | Planned |
| 5 | **Multi-restaurant platform** | Restaurant onboarding, per-restaurant theme (logo, colours, fonts), several menus per restaurant (lunch, dinner, drinks), languages, subscription billing. | Planned |
| 6 | **Immersive extras** | Real 3D food models (glTF/USDZ) and "view on your table" AR, as an upgrade alongside the photo viewer. | Later |

## Milestone 1, what was built

The smallest meaningful step: a customer opens a menu, picks a dish and rotates it. No backend, logins or admin yet.

- `app/index.html`, `app/styles.css`, `app/app.js`: the customer app (menu view and dish view).
- `app/viewer.js`: the 360° viewer, kept separate so it can be reused and later swapped for a 3D viewer.
- `app/data/restaurants/sample-table.json`: one restaurant's whole menu as a single document.
- `app/media/dishes/<dish>/00.webp … 35.webp`: 36 frames per dish (every 10°), plus `thumb.webp`.
- `tools/render-dishes/`: the script that generated the sample dish frames.

All dishes, prices and images in this milestone are **invented sample content**, and the app labels them that way on screen. The sample dish images are computer-generated 3D renders made for this demo, so there are no rights issues.

## Key decisions

### Stack: plain static web app now, then Next.js + Postgres

- **Now:** HTML, CSS and JavaScript modules with no build step and no framework. A QR menu has to open fast on poor restaurant Wi-Fi. A static site loads in well under a second, works on any host and gives nothing to maintain while the experience is still being proven.
- **From milestone 3 to 4:** move to **Next.js (React) with TypeScript** on **Vercel or Netlify**, with **Postgres (Supabase)** for data, auth and image storage. Supabase gives logins for staff and row-level security, which keeps each restaurant's data separate. The viewer and the menu data format carry over as they are.
- **No app install.** Everything runs in the phone's browser, as the vision requires.

### Data model that already allows many restaurants

Each restaurant is one document today (`data/restaurants/<slug>.json`). Its shape maps directly onto database tables later:

```
restaurant (id, slug, name, tagline, currency, locale, theme, isSample)
  └─ category (id, restaurantId, name, sortOrder)
       └─ dish (id, restaurantId, categoryId, name, summary, description,
                price {amount in cents}, ingredients[], allergens[], dietary[],
                badges[], available, unavailableNote,
                media {spin {path, frames}, cover})
```

- The **restaurant slug in the URL** (`?r=sample-table` now, `/r/swiss-butter` later) chooses the menu, so a second restaurant is just a second document or row.
- **Prices are integers in cents** with the currency set per restaurant, so there are no rounding errors and any country works.
- **Allergens use the 14 standard codes** (EU/UK and Swiss lists match), so labels can be translated and filtered.
- **`isSample`** is a flag on the restaurant. When it is true the app shows "Sample menu" badges and notices, which keeps sample content clearly apart from real restaurant information.
- **Availability** (`available`, `unavailableNote`) is in from the start because "sold out tonight" is the edit staff will make most often.
- Later additions that fit without breaking anything: `menus[]` (lunch and dinner), `translations`, `modifiers` (cooking level, sauces), `tableId` for analytics.

### 360° viewer: photo sequence on a canvas

- A dish is photographed on a turntable: **36 photos, one every 10°**, from a fixed camera at about 30 to 35° above the plate. The viewer shows the photo that matches how far the finger has dragged.
- **Why photos rather than 3D models first:** real photos look exactly like the food, any photographer can shoot them with a turntable and a tripod, and they work on every phone. 3D food scans cost more and often look less appetising.
- **How it stays smooth:** frames are drawn on one `<canvas>`. They load in an even spread (0°, 180°, 90°, 270° and so on), so rotation works before every photo has arrived. Drags have inertia. Vertical swipes still scroll the page, and horizontal ones turn the plate.
- **Size:** each frame is a WebP image of 900 × 900 px with a transparent background, about 25 to 30 KB, so a dish costs about 1 MB. Production can serve smaller frames to small screens from an image CDN.
- **Accessibility:** the viewer is a keyboard-operable slider (arrow keys, Home). It respects "reduce motion" and has an Auto-rotate button.
- **Room to grow:** `media` can later hold `model3d` (glTF/USDZ) and the dish page can offer "View in 3D / AR" next to the photo viewer, without changing anything else.

### Hosting

- **Milestone 1:** any static host. The demo is published as a private claude.ai artifact for review, and it can be deployed to Netlify (connected to this project) on request.
- **Milestone 2 onward:** Netlify or Vercel on a custom domain, with images on a CDN. The QR code should point at a short, stable link (`menuverse.app/r/swiss-butter?t=12`) so menus can change without reprinting codes.

## Content and permissions for the Swiss Butter pilot

Nothing from Swiss Butter is used until the right people approve it. To build milestone 2 we need:

1. The current menu: dish and drink names, descriptions, prices and currency for the pilot branch.
2. Allergen and ingredient information that the restaurant confirms.
3. Permission to use the logo, colours and existing photos in the pilot.
4. A photo session for 2 or 3 signature dishes: 36 turntable photos each, on a plain background, with even lighting.

## How each milestone is verified

- Automated screenshots on a phone-sized screen (390 × 844) and a desktop screen.
- A scripted drag test that checks the dish actually rotates.
- A manual check on at least one iPhone and one Android phone before anything goes in front of customers.
