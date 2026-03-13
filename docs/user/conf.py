# InvToolkit User Guide — Sphinx Configuration

project = "InvToolkit — User Guide"
copyright = "2024, Alejandro Blanco"
author = "Alejandro Blanco"

extensions = ["sphinx.ext.mathjax", "myst_parser"]

html_theme = "sphinx_rtd_theme"
html_theme_options = {
    "navigation_depth": 3,
    "collapse_navigation": False,
}

exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]
