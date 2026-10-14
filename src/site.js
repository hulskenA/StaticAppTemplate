// The one script every page loads. A static site has no server of its own, so a page cannot know
// who is signed in. All this does is offer the sign-in's "Sign out" when the site sits behind it
// ("signIn": "required" in site.config.json).
const setting = document.querySelector('meta[name="sign-in"]');
const link = document.getElementById('sign-out');

function signOutUrl() {
  if (setting?.content !== 'required') return null;
  // "signInUrl" in site.config.json, when the sign-in is not at auth.<the site's domain>.
  if (setting.dataset.url) return `${setting.dataset.url.replace(/\/$/, '')}/logout`;
  // my-site.example.com and www.my-site.example.com → auth.example.com
  const host = location.hostname.replace(/^www\./, '');
  const parts = host.split('.');
  if (/^[\d.]+$/.test(host) || parts.length < 3) return null; // on your PC: no sign-in in front
  return `https://auth.${parts.slice(1).join('.')}/logout`;
}

const url = signOutUrl();
if (link && url) { link.href = url; link.hidden = false; }
