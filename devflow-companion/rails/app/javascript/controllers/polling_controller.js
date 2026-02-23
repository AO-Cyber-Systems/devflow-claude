import { Controller } from "@hotwired/stimulus"

// Reusable polling controller for Turbo Frame auto-refresh
// Usage: <div data-controller="polling" data-polling-interval-value="5000" data-polling-url-value="/services">
export default class extends Controller {
  static values = {
    interval: { type: Number, default: 5000 },
    url: String,
  }

  connect() {
    this.startPolling()
  }

  disconnect() {
    this.stopPolling()
  }

  startPolling() {
    this.timer = setInterval(() => {
      this.refresh()
    }, this.intervalValue)
  }

  stopPolling() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async refresh() {
    if (!this.urlValue) return

    try {
      const response = await fetch(this.urlValue, {
        headers: {
          Accept: "text/vnd.turbo-stream.html",
          "X-Requested-With": "XMLHttpRequest",
        },
      })

      if (response.ok) {
        const html = await response.text()
        if (response.headers.get("Content-Type")?.includes("turbo-stream")) {
          Turbo.renderStreamMessage(html)
        }
      }
    } catch {
      // Silently fail on polling errors
    }
  }
}
