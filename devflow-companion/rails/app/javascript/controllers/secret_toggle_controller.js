import { Controller } from "@hotwired/stimulus"

// Toggle secret value visibility
// Usage: <div data-controller="secret-toggle">
//          <span data-secret-toggle-target="value" data-secret="actual-value">••••••••</span>
//          <button data-action="secret-toggle#toggle">Reveal</button>
//        </div>
export default class extends Controller {
  static targets = ["value", "button"]

  toggle() {
    this.valueTargets.forEach((el) => {
      if (el.dataset.revealed === "true") {
        el.textContent = "\u2022".repeat(8)
        el.dataset.revealed = "false"
      } else {
        el.textContent = el.dataset.secret
        el.dataset.revealed = "true"
      }
    })

    this.buttonTargets.forEach((btn) => {
      btn.textContent = btn.textContent === "Reveal" ? "Hide" : "Reveal"
    })
  }
}
