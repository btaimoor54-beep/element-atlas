# Element Atlas explainer videos: storyboard

Four vertical videos (1080 × 1920, 30 fps, 30 s each, H.264 + AAC MP4) for phones, WhatsApp, YouTube Shorts, Reels and TikTok.
Every 3D shot is rendered live from the atlas's own scene code, so what viewers see is what the site shows.
Captions carry the explanation (most short videos are watched muted); a soft generated music bed plays underneath.
`*word*` in a caption is highlighted. The timings and wording here match `parts.js`.

Layout: brand row and part title at the top, the stage (3D or a drawn piece of the site's interface) in the middle,
the step label and caption below it, and the site address with a progress bar at the bottom.

## Making the videos

1. From the project folder, start the studio server, which saves uploads into `video/out`:
   `powershell -ExecutionPolicy Bypass -File .claude/serve.ps1 -File video\studio.html -Root . -Raw -UploadDir video\out -Port 8773`
   then open http://localhost:8773 in Chrome or Edge (WebCodecs is needed).
2. In the console: `await Studio.render(1, { stills: true })` (parts 1 to 4). Each part writes:
   - `<file>.mp4`: 1080 × 1920 at 7 Mbps
   - `<file>-whatsapp.mp4`: 720 × 1280 at 2 Mbps, under WhatsApp's and most chat apps' size limits
   - `<file>-sheet.jpg`: a contact sheet, plus a few stills
3. `await Studio.still(2, 11.2, 'name.jpg')` saves one frame for checking a shot.

## Part 1: Find any element (the periodic table)

| Time | Stage | Step · Caption |
| --- | --- | --- |
| 0–3.2 | Table cells pop in; big title | A quick tour of the free *Element Atlas* website. |
| 3.2–8.6 | Full table, coloured by family, legend | Periodic table · All *118 elements*, laid out like the real periodic table. |
| 8.6–14.4 | Pointer taps oxygen; its card opens (symbol, mass, electrons, photo) | Tap · *Tap* any element to open its card. |
| 14.4–20.2 | "Color by" switches: state → where the atoms were made, each with its full legend | Color by · Use *Color by* to see states, where atoms were made and more. |
| 20.2–25.6 | Search box types "water"; matching substances appear; the water molecule opens in 3D | Search · Or *search* for any element or compound. |
| 25.6–30 | End card | Try it · Free · no sign-up · works on *any phone*. Next: Part 2 |

## Part 2: Zoom into an atom (the element explorer)

| Time | Stage | Step · Caption |
| --- | --- | --- |
| 0–3 | Oxygen atom; title | Pick an element, then zoom through *six levels*. |
| 3–7.5 | Bohr atom, electrons orbiting | Level 1 · *Atom*: electrons in shells. The outer (gold) ones do the bonding. |
| 7.5–12.5 | Oxygen-16 nucleus (note: 8 protons, 8 neutrons), then inside a proton (note: up + up + down quarks) | Level 2 · *Nucleus*: 8 protons and 8 neutrons, each made of *3 quarks*. |
| 12.5–15.5 | One 2p orbital: two lobes, like a dumbbell | Level 3 · *Orbitals*: clouds showing where electrons are likely to be. |
| 15.5–19.5 | O₂ molecule with shared electrons and bond length | Level 4 · *Bonding*: two oxygen atoms share electrons to make *O₂*. |
| 19.5–23.7 | Temperature slider: solid at 40 K, liquid at 72 K, gas at 150 K (O₂ melts at 54 K, boils at 90 K); the camera pulls back as the gas fills its box | Level 5 · *Matter*: change the temperature: solid, liquid, gas. |
| 23.7–26 | Photo of liquid oxygen, with credit | Level 6 · Real *photos* of the elements. |
| 26–30 | End card | Try it · Explore all *118 elements*, level by level. Next: Part 3 |

## Part 3: Molecules in motion (compounds)

| Time | Stage | Step · Caption |
| --- | --- | --- |
| 0–3 | 64 water molecules moving, hydrogen bonds drawn; title | See how molecules *move* and *stick together*. |
| 3–8 | Methane → ammonia → water, with bond angles and lengths | Molecule · Pick any of *238 substances*: see its shape and bond angles. |
| 8–13 | Two water molecules joined by a hydrogen bond | Two molecules · A *hydrogen bond* (gold dashes) holds them together. |
| 13–19 | Cluster of 12; live H-bond count | Cluster · Hydrogen bonds *form and break* as the molecules move. |
| 19–25 | 64 molecules; temperature slider rises from 250 K to 800 K and the H-bond count falls from about 95 to 25 | Many molecules · *Heat them up* and the hydrogen bonds break. |
| 25–30 | End card | Try it · Water, salt, caffeine, DNA bases and *many more*. Next: Part 4 |

## Part 4: Make your own bonds (combine, theme, full screen)

| Time | Stage | Step · Caption |
| --- | --- | --- |
| 0–3 | Na and Cl picked, held apart; title | Pick *any two elements* and see how they bond. |
| 3–9 | Sodium hands an electron to chlorine; verdict pill | Ionic · Sodium *gives* an electron to chlorine: an *ionic bond*, NaCl. |
| 9–14.5 | Hydrogen and oxygen share electrons; Δχ meter marked "uneven sharing" | Covalent · Hydrogen and oxygen *share* electrons, but oxygen pulls harder. |
| 14.5–19.5 | The site in dark, then light spreading out from the theme button | Theme · Switch between *dark and light* with one tap. |
| 19.5–25 | Salt crystal in 3D expanding to full screen | Full screen · Go *full screen*, on a phone or a computer. |
| 25–30 | End card | Try it · Explore *118 elements* and *238 substances* in 3D. Free for everyone. Share it with your class! |
