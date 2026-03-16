import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Monitor Action Cable connection state
    this.checkConnection()
    this.interval = setInterval(() => this.checkConnection(), 5000)
  }

  disconnect() {
    clearInterval(this.interval)
  }

  checkConnection() {
    const indicator = document.getElementById("connection-status")
    if (!indicator) return
    // Simple connectivity check
    indicator.classList.toggle("bg-green-500", navigator.onLine)
    indicator.classList.toggle("bg-red-500", !navigator.onLine)
  }
}
