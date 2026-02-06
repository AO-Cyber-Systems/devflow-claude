<script lang="ts">
  // TODO: Add form validation
  // TODO: Implement settings persistence

  let settings = $state({
    theme: 'light',
    notifications: true
  });
</script>

<div class="settings">
  <h1>Settings</h1>

  <form>
    <label>
      Theme:
      <select bind:value={settings.theme}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>

    <label>
      <input type="checkbox" bind:checked={settings.notifications} />
      Enable notifications
    </label>
  </form>
</div>
