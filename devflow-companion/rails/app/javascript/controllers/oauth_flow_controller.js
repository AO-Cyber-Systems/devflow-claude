import { Controller } from "@hotwired/stimulus"

// OAuth flow controller for Claude Max account authorization
// Usage: <div data-controller="oauth-flow" data-oauth-flow-authorize-url-value="/proxy_accounts/authorize" data-oauth-flow-status-url-value="/proxy_accounts/oauth_status">
export default class extends Controller {
  static targets = ["startBtn", "status", "statusText", "error"]
  static values = {
    authorizeUrl: String,
    statusUrl: String,
  }

  disconnect() {
    this.stopPolling()
  }

  async start() {
    this.startBtnTarget.disabled = true
    this.startBtnTarget.textContent = "Starting..."
    this.errorTarget.style.display = "none"

    try {
      const response = await fetch(this.authorizeUrlValue, {
        method: "POST",
        headers: {
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content,
          Accept: "application/json",
        },
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()

      // Open authorization URL in browser
      window.open(data.authorize_url, "_blank")

      // Show waiting state
      this.startBtnTarget.style.display = "none"
      this.statusTarget.style.display = "block"
      this.statusTextTarget.textContent = "Waiting for authorization... (check your browser)"

      // Start polling for completion
      this.pollTimer = setInterval(() => this.checkStatus(), 2000)

      // Timeout after 2 minutes
      this.timeoutTimer = setTimeout(() => {
        this.stopPolling()
        this.showError("Authorization timed out. Please try again.")
      }, 125000)
    } catch (e) {
      this.showError(`Failed to start OAuth flow: ${e.message}`)
    }
  }

  async checkStatus() {
    try {
      const response = await fetch(this.statusUrlValue, {
        headers: { Accept: "application/json" },
      })
      if (!response.ok) return

      const data = await response.json()

      if (data.status === "complete") {
        this.stopPolling()
        window.location.reload()
      } else if (data.status === "timeout") {
        this.stopPolling()
        this.showError("Authorization timed out. Please try again.")
      } else if (data.status?.startsWith("error:")) {
        this.stopPolling()
        this.showError(data.status.replace("error:", ""))
      }
    } catch {
      // Silently retry on polling errors
    }
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }

  showError(message) {
    this.statusTarget.style.display = "none"
    this.errorTarget.style.display = "block"
    this.errorTarget.textContent = message
    this.startBtnTarget.style.display = "inline-flex"
    this.startBtnTarget.disabled = false
    this.startBtnTarget.textContent = "Add Claude Max Account"
  }
}
