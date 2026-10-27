# Theme values: "Jamaica" (tweakcn)

Source: https://tweakcn.com/themes/cmlh0ynpe000304k1874nb07w
Raw registry JSON (fetched 2026-10-25): https://tweakcn.com/r/themes/cmlh0ynpe000304k1874nb07w
Fonts: Outfit (sans), JetBrains Mono (mono), Georgia (serif). Radius `1.25rem`. Body `letter-spacing: var(--tracking-normal)`, with `--tracking-normal: -0.02em`.

## light (`:root`)

```css
--background: oklch(0.987 0.0031 91.437);
--foreground: oklch(0.1759 0.0275 161.2531);
--card: oklch(1 0 0);
--card-foreground: oklch(0.1759 0.0275 161.2531);
--popover: oklch(1 0 0);
--popover-foreground: oklch(0.1759 0.0275 161.2531);
--primary: oklch(0.623 0.1688 149.1777);
--primary-foreground: oklch(0.987 0.0031 91.437);
--secondary: oklch(0.8611 0.1734 91.9641);
--secondary-foreground: oklch(0.1759 0.0275 161.2531);
--muted: oklch(0.9587 0.0063 91.4666);
--muted-foreground: oklch(0.526 0.029 163.6044);
--accent: oklch(0.9562 0.0383 157.8236);
--accent-foreground: oklch(0.5457 0.1464 149.3783);
--destructive: oklch(0.6356 0.2082 25.3782);
--border: oklch(0.9297 0.0128 164.7776);
--input: oklch(0.9297 0.0128 164.7776);
--ring: oklch(0.623 0.1688 149.1777);
--chart-1: oklch(0.623 0.1688 149.1777);
--chart-2: oklch(0.8611 0.1734 91.9641);
--chart-3: oklch(0.3227 0.0644 157.5659);
--chart-4: oklch(0.6758 0.1453 238.462);
--chart-5: oklch(0.741 0.1645 52.1676);
--sidebar: oklch(0.2566 0.03 161.5403);
--sidebar-foreground: oklch(0.987 0.0031 91.437);
--sidebar-primary: oklch(0.623 0.1688 149.1777);
--sidebar-primary-foreground: oklch(0.987 0.0031 91.437);
--sidebar-accent: oklch(0.3282 0.042 161.1204);
--sidebar-accent-foreground: oklch(0.8611 0.1734 91.9641);
--sidebar-border: oklch(0.3512 0.0457 161.0245);
--sidebar-ring: oklch(0.623 0.1688 149.1777);
```

## dark (`.dark`)

```css
--background: oklch(0.1375 0.0104 165.2256);
--foreground: oklch(0.9656 0.0053 91.4567);
--card: oklch(0.1797 0.0167 162.4012);
--card-foreground: oklch(0.9656 0.0053 91.4567);
--popover: oklch(0.1662 0.0143 162.7418);
--popover-foreground: oklch(0.9656 0.0053 91.4567);
--primary: oklch(0.7763 0.2066 149.5172);
--primary-foreground: oklch(0.1375 0.0104 165.2256);
--secondary: oklch(0.8512 0.167 93.1252);
--secondary-foreground: oklch(0.1375 0.0104 165.2256);
--muted: oklch(0.2496 0.0207 162.7409);
--muted-foreground: oklch(0.7753 0.02 164.4487);
--accent: oklch(0.3109 0.0616 153.0738);
--accent-foreground: oklch(0.7763 0.2066 149.5172);
--destructive: oklch(0.5875 0.2303 28.2622);
--border: oklch(0.2843 0.0249 162.5796);
--input: oklch(0.2843 0.0249 162.5796);
--ring: oklch(0.7763 0.2066 149.5172);
--chart-1: oklch(0.7763 0.2066 149.5172);
--chart-2: oklch(0.8512 0.167 93.1252);
--chart-3: oklch(0.7939 0.1203 213.8388);
--chart-4: oklch(0.66 0.1928 313.0914);
--chart-5: oklch(0.6676 0.1841 33.1504);
--sidebar: oklch(0.1215 0.0119 165.2505);
--sidebar-foreground: oklch(0.9656 0.0053 91.4567);
--sidebar-primary: oklch(0.7763 0.2066 149.5172);
--sidebar-primary-foreground: oklch(0.1375 0.0104 165.2256);
--sidebar-accent: oklch(0.2317 0.0258 161.7529);
--sidebar-accent-foreground: oklch(0.8512 0.167 93.1252);
--sidebar-border: oklch(0.2496 0.0207 162.5796);
--sidebar-ring: oklch(0.7763 0.2066 149.5172);
```

Deviation: the repo's `.dark` uses `--destructive: oklch(0.704 0.191 22.216)` (original shadcn dark value, 5.43:1 on `--card`) instead of the preset's `oklch(0.5875 0.2303 28.2622)` above (3.42:1, fails AA for small text). `.dark` is the dark block above; the light block is unchanged.

Not carried here: `destructive-foreground` (light `oklch(0.9838 0.0035 247.8583)`, dark `oklch(1 0 0)`) and the `--shadow-*` set. Both are in the registry JSON above. The current `global.css` has no `--destructive-foreground`, so adding it is a plan decision.
