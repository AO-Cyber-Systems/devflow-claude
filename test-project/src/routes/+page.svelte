<script lang="ts">
  // TODO: Add authentication check
  let count = $state(0);

  function increment() {
    count++;
  }
</script>

<main>
  <h1>Welcome to the App</h1>
  <!-- TODO: Add hero section with call-to-action -->
  <button onclick={increment}>
    Count: {count}
  </button>
</main>
