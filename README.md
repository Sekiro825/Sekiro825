# Hi there, I'm Sekiro825! 👋

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Sekiro825/Sekiro825/main/dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Sekiro825/Sekiro825/main/light.svg">
    <img alt="Sekiro825 Profile Header" src="https://raw.githubusercontent.com/Sekiro825/Sekiro825/main/dark.svg" width="100%">
  </picture>
</p>

## 🚀 Animated GitHub Jet Contribution Heatmap

<p align="center">
  <img
    src="https://raw.githubusercontent.com/Sekiro825/Sekiro825/main/dist/github-jet.svg"
    alt="GitHub Jet Heatmap Animation"
    width="100%"
  />
</p>

---

## 🛠️ Tech Stack & Skills

- **Languages:** JavaScript, TypeScript, Python, Java, C/C++
- **Frontend:** React, HTML5, CSS3, Tailwind CSS
- **Backend:** Node.js, Express.js, REST APIs
- **Databases & Tools:** MongoDB, PostgreSQL, Firebase, Docker, Git, VS Code

---

## 📊 GitHub Stats

<p align="center">
  <img src="https://github-readme-stats.vercel.app/api?username=Sekiro825&show_icons=true&theme=dark" alt="Sekiro825 GitHub Stats" height="170" />
  <img src="https://github-readme-streak-stats.herokuapp.com/?user=Sekiro825&theme=dark" alt="Sekiro825 GitHub Streak" height="170" />
</p>

---

## ⚙️ How the Jet Heatmap Animation Works

This profile repository automatically generates the **GitHub Jet Heatmap Animation** using GitHub Actions!

- **Script:** `generate.mjs` fetches real contribution data via GitHub GraphQL API and constructs the animated SVG.
- **Workflow:** `.github/workflows/jet-heatmap.yml` runs once every 24 hours (or on push/dispatch) to keep the animation updated with live contributions.

### Quick Setup Steps for GitHub Actions:
1. **Enable Write Permissions:** In your GitHub repo settings (`Settings` -> `Actions` -> `General` -> `Workflow permissions`), select **Read and write permissions**.
2. **Trigger Workflow:** Go to `Actions` tab -> select `Update jet heatmap SVG` -> click **Run workflow**.
3. It will generate `dist/github-jet.svg` and commit it back to your `main` branch automatically!
