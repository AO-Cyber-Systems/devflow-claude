import { Controller } from "@hotwired/stimulus"

// Package search controller — client-side filter + debounced server search
export default class extends Controller {
  static values = {
    searchUrl: String,
    type: String, // "brew" or "mise"
  }

  static targets = [
    "input",
    "installedList",
    "searchResults",
    "searchList",
    "searchCount",
    "filterAll",
    "filterFormulae",
    "filterCasks",
    "filterOutdated",
  ]

  connect() {
    this.debounceTimer = null
    this.activeFilter = "all"
  }

  onInput() {
    const query = this.inputTarget.value.trim()

    // Instant client-side filter of installed list
    this.filterInstalled(query)

    // Debounced server search for 3+ chars
    clearTimeout(this.debounceTimer)
    if (query.length >= 3) {
      this.debounceTimer = setTimeout(() => this.serverSearch(query), 300)
    } else {
      this.hideSearchResults()
    }
  }

  filterInstalled(query) {
    if (!this.hasInstalledListTarget) return

    const rows = this.installedListTarget.querySelectorAll("[data-package-name]")
    const lowerQuery = query.toLowerCase()

    rows.forEach((row) => {
      const name = row.dataset.packageName.toLowerCase()
      const matchesQuery = !query || name.includes(lowerQuery)
      const matchesFilter = this.matchesActiveFilter(row)
      row.style.display = matchesQuery && matchesFilter ? "" : "none"
    })
  }

  matchesActiveFilter(row) {
    switch (this.activeFilter) {
      case "formulae":
        return row.dataset.packageType === "formula"
      case "casks":
        return row.dataset.packageType === "cask"
      case "outdated":
        return row.dataset.packageOutdated === "true"
      default:
        return true
    }
  }

  filterAll() {
    this.setFilter("all", "filterAll")
  }
  filterFormulae() {
    this.setFilter("formulae", "filterFormulae")
  }
  filterCasks() {
    this.setFilter("casks", "filterCasks")
  }
  filterOutdated() {
    this.setFilter("outdated", "filterOutdated")
  }

  setFilter(filter, targetName) {
    this.activeFilter = filter

    // Update button styles
    const buttons = [
      "filterAll",
      "filterFormulae",
      "filterCasks",
      "filterOutdated",
    ]
    buttons.forEach((name) => {
      if (this[`has${name.charAt(0).toUpperCase() + name.slice(1)}Target`]) {
        const target = this[`${name}Target`]
        target.classList.toggle("active", name === targetName)
      }
    })

    // Re-filter
    this.filterInstalled(this.inputTarget.value.trim())
  }

  async serverSearch(query) {
    try {
      const url = new URL(this.searchUrlValue, window.location.origin)
      url.searchParams.set("q", query)

      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      })

      if (!response.ok) return

      const results = await response.json()
      this.renderSearchResults(results)
    } catch (e) {
      // Silently fail on network errors
    }
  }

  renderSearchResults(results) {
    if (!results.length) {
      this.hideSearchResults()
      return
    }

    if (this.hasSearchCountTarget) {
      this.searchCountTarget.textContent = `(${results.length})`
    }

    const isMise = this.typeValue === "mise"
    let html = ""

    results.forEach((item) => {
      const name = this.escapeHtml(item.name)
      const desc = item.desc ? this.escapeHtml(item.desc) : ""
      const version = item.version ? this.escapeHtml(item.version) : ""
      const type = item.type || ""
      const installed = item.installed

      html += `<div class="service-row">
        <div class="service-info" style="min-width: 0; flex: 1;">
          <div style="min-width: 0;">
            <div class="flex items-center gap-2">
              <span class="service-name">${name}</span>
              ${type ? `<span class="badge badge-neutral">${this.escapeHtml(type)}</span>` : ""}
              ${installed ? '<span class="badge badge-success">installed</span>' : ""}
            </div>
            ${desc ? `<div class="service-detail" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px;">${desc}</div>` : ""}
          </div>
        </div>
        <div class="flex items-center gap-2" style="flex-shrink: 0;">
          ${version ? `<span class="text-muted" style="font-size: 12px; font-family: var(--font-mono);">${version}</span>` : ""}
          ${
            !installed
              ? `<button class="btn btn-sm btn-primary"
                  data-controller="package-action"
                  data-package-action-url-value="${this.escapeHtml(this.installUrl(name, type))}"
                  ${isMise ? "" : `data-package-action-params-value='${this.escapeHtml(JSON.stringify({ cask: type === "cask" ? "true" : "false" }))}'`}
                  data-action="package-action#run">
                Install
              </button>`
              : ""
          }
        </div>
      </div>`
    })

    if (this.hasSearchListTarget) {
      this.searchListTarget.innerHTML = html
    }
    if (this.hasSearchResultsTarget) {
      this.searchResultsTarget.style.display = ""
    }
  }

  installUrl(name, type) {
    if (this.typeValue === "mise") {
      return `/mise_tools/${encodeURIComponent(name)}/install_tool`
    }
    return `/brew_packages/${encodeURIComponent(name)}/install_package`
  }

  hideSearchResults() {
    if (this.hasSearchResultsTarget) {
      this.searchResultsTarget.style.display = "none"
    }
    if (this.hasSearchListTarget) {
      this.searchListTarget.innerHTML = ""
    }
  }

  escapeHtml(str) {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
  }
}
