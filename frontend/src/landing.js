// Progressive enhancement: every section remains visible without JavaScript.
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.remove('reveal-pending');
      observer.unobserve(entry.target);
    }
  }, {threshold: 0.08});
  for (const section of document.querySelectorAll('.feature, .steps li, .connection-flow')) {
    if (section.getBoundingClientRect().top > innerHeight) {
      section.classList.add('reveal-ready', 'reveal-pending'); observer.observe(section);
    }
  }
  // Never leave informational content hidden if an observer is delayed.
  setTimeout(() => document.querySelectorAll('.reveal-pending').forEach(el => el.classList.remove('reveal-pending')), 5000);
}
