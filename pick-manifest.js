// The home-screen manifest. Email sign-in is the only view since the switchover (14 Nov 2026), so every device gets the
// one whose home-screen address is ?db=1 (that address still works; the ?db part is now ignored).
document.write('<link rel="manifest" href="manifest-db.webmanifest">');
