# Image and video credits - sunmill-bakehouse

Demo site for a made-up shop. Every image below is free-licence stock (Pexels), resized
and compressed to WebP (photos: `tools/make_images.py`, quality 80; walk-in frames:
`tools/video_to_walk.py`, 1920x1080 / 810x1080 at quality 75). They are NOT photos of the
business and are labelled "sample" on the site (GROUND_RULES Rule 10).

Updated 2026-10-07 (demo quality pass): bread hero added; walk-in moved to a short "Step inside" section.

## Walk-in video ("Step inside" section)

- Files: `assets/walk/` (all frames + posters)
- Creator: K (Pexels)
- Source: https://www.pexels.com/video/7405923/ (found with tools/find_photos.py --source pexels-video, "walking into bakery", 2026-10-08)
- Licence: Pexels License (free to use and modify, attribution not required) - https://www.pexels.com/license/
- Notes: a slow pass along racks of fresh baguettes; bakers out of focus in the background (no faces
  in focus, no signage). Replaced the earlier clip (Pexels 28542772), which reviewers said was visibly an
  American cafe. Not Sunmill's bakery - stock footage for the demo.

Frames made with `tools/video_to_walk.py` (26 frames). Raw video not kept in the repo.

## Photos

| File(s) in assets/img/ | Creator | Source |
|---|---|---|
| `croissants-*.webp` | Arda Kaykisiz | https://www.pexels.com/photo/freshly-made-croissants-20002837/ |
| `cake-*.webp` | Halyna Bolekhan | https://www.pexels.com/photo/elegant-summer-layer-cake-with-fresh-fruits-29284429/ (found with tools/find_photos.py, "layer cake on cake stand", 2026-10-10; 4:5 crop. Replaced the earlier party-table cake photo) |
| `hero-bread-*.webp` | eat-kubba | https://www.pexels.com/photo/sourdough-breads-on-white-woven-fabric-11842163/ |
| `loaf-*.webp`, `assets/img/og.jpg` | travel-with-lenses | https://www.pexels.com/photo/crusty-artisan-bread-on-wooden-board-30890566/ |

Licence for all photos: Pexels License (free to use and modify, attribution not required) - https://www.pexels.com/license/

Icons: inline SVG drawn for the template; WhatsApp glyph from Simple Icons (CC0).
Fonts: self-hosted, see "Fonts" below (body text uses system fonts).

## Fonts
- `assets/fonts/fraunces-*.woff2`: Fraunces (OFL-1.1), Latin subset, self-hosted from Fontsource (fontsource.org); display face of option A (weight 700)
- `assets/fonts/fredoka-*.woff2`: Fredoka (OFL-1.1), Latin subset, self-hosted from Fontsource (fontsource.org); display face of option B (700)
- `assets/fonts/cormorant-garamond-*.woff2`: Cormorant Garamond (OFL-1.1), Latin subset, self-hosted from Fontsource (fontsource.org); display face of option C (400)
- `assets/fonts/zilla-slab-*.woff2`: Zilla Slab (OFL-1.1), Latin subset, self-hosted from Fontsource (fontsource.org); display face of option D (700)
- `styles/thumbs/*.webp`: small screenshots of this demo's own styles (tools/make_style.py --thumbs); the photos in them are credited above.
