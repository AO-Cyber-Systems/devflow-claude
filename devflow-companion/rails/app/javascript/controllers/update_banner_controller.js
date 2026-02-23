import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["banner", "message", "action", "progress"]

  connect() {
    this.cleanup = null

    if (!window.devflow?.onUpdateStatus) return

    this.cleanup = window.devflow.onUpdateStatus((status) => {
      this.handleStatus(status)
    })

    // Fetch initial status
    if (window.devflow.getUpdateStatus) {
      window.devflow.getUpdateStatus().then((status) => {
        this.handleStatus(status)
      })
    }
  }

  disconnect() {
    if (this.cleanup) {
      this.cleanup()
      this.cleanup = null
    }
  }

  handleStatus(data) {
    if (!data || !this.hasBannerTarget) return

    const { status, updateInfo, downloadProgress } = data

    switch (status) {
      case "available":
        this.messageTarget.textContent = `Update available: v${updateInfo?.version || "?"}`
        this.actionTarget.style.display = "none"
        this.progressTarget.style.display = "none"
        this.bannerTarget.style.display = "flex"
        break

      case "downloading":
        const pct = downloadProgress?.percent || 0
        this.messageTarget.textContent = `Downloading update...`
        this.actionTarget.style.display = "none"
        this.progressTarget.style.display = "block"
        const bar = this.progressTarget.querySelector(".progress-bar")
        if (bar) bar.style.width = `${pct}%`
        this.bannerTarget.style.display = "flex"
        break

      case "downloaded":
        this.messageTarget.textContent = `Update ready: v${updateInfo?.version || "?"}`
        this.actionTarget.style.display = "inline-flex"
        this.progressTarget.style.display = "none"
        this.bannerTarget.style.display = "flex"
        break

      default:
        this.bannerTarget.style.display = "none"
        break
    }
  }

  install() {
    if (window.devflow?.installUpdate) {
      window.devflow.installUpdate()
    }
  }

  hideBanner() {
    if (this.hasBannerTarget) {
      this.bannerTarget.style.display = "none"
    }
  }
}
