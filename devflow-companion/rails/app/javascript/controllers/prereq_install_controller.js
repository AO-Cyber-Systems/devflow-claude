import { Controller } from "@hotwired/stimulus"

// Prerequisite install controller — iterates recipe steps sequentially
// Server steps POST to /prerequisites/install, sudo steps use Electron bridge
export default class extends Controller {
  static values = {
    recipe: String,
    steps: Array,
    url: String,
  }

  async run() {
    const btn = this.element
    const originalText = btn.textContent
    btn.disabled = true

    try {
      for (const step of this.stepsValue) {
        btn.textContent = step.description || "Installing..."
        btn.classList.add("installing")

        if (step.type === "server") {
          const result = await this.runServerStep(step.key)
          if (!result.success) {
            this.showFailed(btn, originalText, result.error || "Command failed")
            return
          }
        } else if (step.type === "sudo") {
          const result = await this.runSudoStep(step.command)
          if (!result.success) {
            this.showFailed(btn, originalText, result.error || "Sudo command failed")
            return
          }
        }
      }

      this.showSuccess(btn)
    } catch (e) {
      this.showFailed(btn, originalText, e.message)
    }
  }

  async runServerStep(key) {
    const response = await fetch(this.urlValue, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content,
        Accept: "application/json",
      },
      body: JSON.stringify({ recipe: this.recipeValue, step: key }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return { success: false, error: data.error || `HTTP ${response.status}` }
    }

    return await response.json()
  }

  async runSudoStep(command) {
    if (window.devflow?.requestSudo) {
      try {
        const result = await window.devflow.requestSudo(command)
        return { success: result !== false }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }

    return {
      success: false,
      error: "Sudo requires the DevFlow Companion desktop app. Run manually: sudo " + command,
    }
  }

  showSuccess(btn) {
    btn.classList.remove("installing")
    btn.classList.add("install-success")
    btn.textContent = "Installed!"

    // Auto-recheck after brief delay
    setTimeout(() => {
      const frame = document.querySelector("turbo-frame#prerequisites-results")
      if (frame) {
        frame.src = frame.src || frame.getAttribute("src")
        frame.reload()
      }
    }, 500)
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
