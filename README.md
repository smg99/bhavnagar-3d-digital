# 🏙️ Bhavnagar 3D Digital Twin

An interactive, highly performant 3D digital twin of Bhavnagar, Gujarat, India. This project renders the entire city in 3D right in your browser, running at a blistering 60 FPS using raw GPU buffer geometries.

🌍 **[View the Live Demo](https://smg99.github.io/bhavnagar-3d-digital/)**

## ✨ Features

- **170,000+ Accurate 3D Buildings:** Utilizing **Overture Maps** (Microsoft Building Footprints), the engine reads the raw satellite polygon geometries and mathematically triangulates and extrudes them into 100% accurate, true-to-life 3D silhouettes (handling complex L-shapes, circular facades, etc.).
- **Dynamic Typologies:** An algorithmic heuristic automatically shades buildings into residential (warm terracotta) or commercial (cool glass) palettes based on their exact footprint area and height.
- **Interactive Town Planning:** Use the Infrastructure Estimator to click around the city and draw out proposed flyovers, underground tunnels, and arterial roads, complete with cost estimates.
- **Traffic & Flood Simulations:** View low-poly AI vehicles navigating the city's arterial roads, and visualize potential disaster zones with the interactive Flood Simulator slider.
- **Live City Data:** Pulls real-time road networks, water bodies, and neighborhood labels from **OpenStreetMap** (Overpass API).
- **Environment:** Live Weather and Air Quality Index (AQI) integration.

## 🛠️ Tech Stack

- **Core:** React 18, TypeScript, Vite
- **3D Engine:** Three.js (custom `BufferGeometry` for high-performance chunk rendering)
- **Styling:** Tailwind CSS, Lucide Icons
- **Data Sources:** OpenStreetMap (Overpass), Overture Maps, Open-Meteo
- **Backend Storage:** Supabase (for saving and loading town planner scenarios)
- **Hosting:** GitHub Pages (Automated via GitHub Actions)

## 🚀 Local Development

To run the digital twin locally on your machine:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/smg99/bhavnagar-3d-digital.git
   cd bhavnagar-3d-digital
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your Supabase credentials to enable the Town Planner save feature:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

## 📦 Deployment

This project uses **GitHub Actions** for seamless continuous integration. Any commits pushed to the `main` branch are automatically built via Vite and deployed to GitHub Pages.

---
*Built with ❤️ for the city of Bhavnagar.*

## ☕ Support the work

If this project saved you some time or you found it useful, consider [buying me a coffee](https://buymeacoffee.com/smg99). It helps me keep building and open-sourcing small useful tools.
