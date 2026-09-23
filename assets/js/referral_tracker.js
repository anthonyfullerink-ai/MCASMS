/**
 * Missed Call Auto SMS - Referral & Rev-Share Partner Tracker
 * Captures ?ref=... or ?via=... or ?aff=... and persists in localStorage and cookies for 30 days.
 * Dynamically decorates all Stripe checkout URLs and direct payment links with client_reference_id.
 */
(function() {
  function getQueryParam(name) {
    var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
  }

  function setCookie(name, val, days) {
    var expires = "";
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (val || "") + expires + "; path=/; SameSite=Lax";
  }

  function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  // 1. Detect referral code from URL or existing storage
  var ref = getQueryParam('ref') || getQueryParam('via') || getQueryParam('aff') || getQueryParam('partner');
  if (ref) {
    ref = ref.trim().toUpperCase();
    try { localStorage.setItem('mcasms_referral_code', ref); } catch (e) {}
    setCookie('mcasms_ref', ref, 30);
  } else {
    try { ref = localStorage.getItem('mcasms_referral_code'); } catch (e) {}
    if (!ref) ref = getCookie('mcasms_ref');
  }

  if (!ref) return;

  // 2. Decorate all Stripe checkout links and buttons on page
  function decorateLinks() {
    var links = document.querySelectorAll('a[href*="buy.stripe.com"], a[href*="checkout.stripe.com"]');
    links.forEach(function(link) {
      try {
        var url = new URL(link.href);
        if (!url.searchParams.has('client_reference_id')) {
          url.searchParams.set('client_reference_id', ref);
          link.href = url.toString();
        }
      } catch (err) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorateLinks);
  } else {
    decorateLinks();
  }

  document.addEventListener('click', function(e) {
    var target = e.target.closest('a[href*="buy.stripe.com"], a[href*="checkout.stripe.com"]');
    if (target) {
      try {
        var url = new URL(target.href);
        if (!url.searchParams.has('client_reference_id')) {
          url.searchParams.set('client_reference_id', ref);
          target.href = url.toString();
        }
      } catch (err) {}
    }
  });

  window.mcasmsReferralCode = ref;
})();
