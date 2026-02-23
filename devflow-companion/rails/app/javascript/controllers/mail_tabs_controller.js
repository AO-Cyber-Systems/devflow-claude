import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["tab", "panel"]

  switch(event) {
    event.preventDefault()
    const index = this.tabTargets.indexOf(event.currentTarget)

    this.tabTargets.forEach((tab, i) => {
      tab.classList.toggle("active", i === index)
    })

    this.panelTargets.forEach((panel, i) => {
      panel.style.display = i === index ? "" : "none"
    })
  }
}
