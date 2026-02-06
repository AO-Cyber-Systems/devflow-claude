<script lang="ts">
  // TODO: Implement dashboard data fetching
  // FIXME: Loading state is not showing correctly

  let data = $state<any[]>([]);
  let loading = $state(true);
</script>

<div class="dashboard">
  <h1>Dashboard</h1>

  {#if loading}
    <p>Loading...</p>
  {:else}
    <ul>
      {#each data as item}
        <li>{item.name}</li>
      {/each}
    </ul>
  {/if}
</div>
