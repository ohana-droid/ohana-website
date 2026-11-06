// スマホ用メニューの開閉
(function () {
  var nav = document.getElementById('gnav');
  var btn = document.getElementById('menuBtn');
  if (!nav || !btn) return;
  btn.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
})();
