<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	let navOpen = $state(false);

	function toggleNav() {
		navOpen = !navOpen;
	}

	function closeNav() {
		navOpen = false;
	}

	const links = [
		{ href: '/restock-report', label: 'Restock Report' },
		{ href: '/fbm-stock', label: 'FBM Stock Check' }
	];

	let currentPath = $derived(page.url.pathname);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<button
	class="nav-menu-toggle"
	class:open={navOpen}
	type="button"
	aria-label="Open navigation menu"
	onclick={toggleNav}
>
	<span></span><span></span><span></span>
</button>

<div
	class="nav-sidebar-overlay"
	class:open={navOpen}
	onclick={closeNav}
	role="presentation"
></div>

<nav class="nav-sidebar" class:open={navOpen}>
	{#each links as link (link.href)}
		<a
			href={link.href}
			class="page-nav-link"
			class:active={currentPath === link.href}
			onclick={closeNav}
		>
			{link.label}
		</a>
	{/each}
</nav>

<div class="container">
	<nav class="page-nav">
		{#each links as link (link.href)}
			<a href={link.href} class="page-nav-link" class:active={currentPath === link.href}>
				{link.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
