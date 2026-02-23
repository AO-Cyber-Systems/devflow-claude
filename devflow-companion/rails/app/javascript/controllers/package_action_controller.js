import { Controller } from "@hotwired/stimulus"

// Reusable async button for install/uninstall/upgrade actions
export default class extends Controller {
  static values = {
    url: String,
    params: Object,
    confirm: String,
  }

  async run() {
    if (this.confirmValue && !window.confirm(this.confirmValue)) {
      return
    }

    const btn = this.element
    const originalText = btn.textContent
    btn.disabled = true
    btn.textContent = "Working..."
    btn.classList.add("installing")

    try {
      const body = this.hasParamsValue ? this.paramsValue : {}
      const response = await fetch(this.urlValue, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok && data.success) {
        btn.classList.remove("installing")
        btn.classList.add("install-success")
        btn.textContent = "Done!"

        // Reload the nearest installed turbo frame after brief delay
        setTimeout(() => {
          const frame = btn.closest(".card")?.querySelector('turbo-frame[id$="-installed"]')
          if (frame) {
            frame.src = frame.src || frame.getAttribute("src")
            frame.reload()
          }
        }, 800)
      } else {
        this.showFailed(btn, originalText, data.error || "Action failed")
      }
    } catch (e) {
      this.showFailed(btn, originalText, e.message)
    }
  }

  showFailed(btn, originalText, error) {
    btn.classList.remove("installing")
    btn.classList.add("install-failed")
    btn.textContent = "Failed"
    btn.title = error

    setTimeout(() => {
      btn.classList.remove("install-failed")
      btn.textContent = originalText
      btn.disabled = false
      btn.title = ""
    }, 3000)
  }
}
