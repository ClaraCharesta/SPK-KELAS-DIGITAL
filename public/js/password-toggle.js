(function () {
    if (window.__pwToggleInit) return;
    window.__pwToggleInit = true;

    var CSS =
        '.pw-field{position:relative;display:block;width:100%;}' +
        '.pw-field input{padding-right:46px !important;}' +
        '.pw-toggle{position:absolute;top:50%;right:6px;transform:translateY(-50%);' +
        'width:34px;height:34px;border:0;background:transparent;border-radius:8px;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;color:#6b7280;padding:0;}' +
        '.pw-toggle:hover{background:rgba(29,95,214,.08);color:#1d5fd6;}' +
        '.pw-toggle:focus-visible{outline:2px solid #1d5fd6;outline-offset:1px;}' +
        '.pw-toggle.aktif{color:#1d5fd6;}' +
        '.pw-toggle svg{width:20px;height:20px;display:block;}';

    var ICON_MATA =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

    var ICON_MATA_TUTUP =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94"></path>' +
        '<path d="M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.16 3.19"></path>' +
        '<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    function pasang(input) {
        if (input.dataset.pwToggle === '1') return;
        input.dataset.pwToggle = '1';

        var wrap = document.createElement('span');
        wrap.className = 'pw-field';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pw-toggle';
        btn.setAttribute('aria-label', 'Tampilkan password');
        btn.setAttribute('aria-pressed', 'false');
        btn.title = 'Tampilkan password';
        btn.innerHTML = ICON_MATA;

        // Cegah input kehilangan fokus saat ikon ditekan.
        btn.addEventListener('mousedown', function (e) { e.preventDefault(); });

        btn.addEventListener('click', function () {
            var tampil = input.type === 'password';
            input.type = tampil ? 'text' : 'password';
            btn.innerHTML = tampil ? ICON_MATA_TUTUP : ICON_MATA;
            btn.classList.toggle('aktif', tampil);
            btn.setAttribute('aria-pressed', tampil ? 'true' : 'false');
            btn.setAttribute('aria-label', tampil ? 'Sembunyikan password' : 'Tampilkan password');
            btn.title = tampil ? 'Sembunyikan password' : 'Tampilkan password';
            input.focus();
        });

        wrap.appendChild(btn);
    }

    function mulai() {
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        var daftar = document.querySelectorAll('input[type="password"]');
        for (var i = 0; i < daftar.length; i++) pasang(daftar[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mulai);
    } else {
        mulai();
    }
})();