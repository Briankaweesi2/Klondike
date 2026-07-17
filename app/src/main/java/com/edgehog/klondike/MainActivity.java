package com.edgehog.klondike;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.Context;
import android.content.res.Configuration;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.io.ByteArrayInputStream;
import java.util.Collections;

public class MainActivity extends ComponentActivity {
    private static final String REWARD_HINT = "hint";
    private static final String REWARD_RESERVE = "reserve";
    private static final String REAL_REWARDED_UNIT_ID = "ca-app-pub-3003465306319489/9245299778";
    private static final String REAL_INTERSTITIAL_UNIT_ID = "ca-app-pub-3003465306319489/3282526655";
    private static final String REAL_BANNER_UNIT_ID = "ca-app-pub-3003465306319489/8749326974";
    private static final String TEST_REWARDED_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";
    private static final String TEST_INTERSTITIAL_UNIT_ID = "ca-app-pub-3940256099942544/1033173712";
    private static final String TEST_BANNER_UNIT_ID = "ca-app-pub-3940256099942544/9214589741";

    private WebView webView;
    private FrameLayout rootLayout;
    private AdView bannerAdView;
    private RewardedAd rewardedAd;
    private String activeRewardRequest = null;
    private InterstitialAd interstitialAd;
    private ConsentInformation consentInformation;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean doubleBackToExitPressedOnce = false;
    private boolean mobileAdsInitialized = false;
    private int systemInsetTopPx = 0;
    private int systemInsetBottomPx = 0;
    private int systemInsetLeftPx = 0;
    private int systemInsetRightPx = 0;
    private int bannerHeightPx = 0;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        rootLayout = new FrameLayout(this);
        webView = new WebView(this);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(rootLayout);
        configureWindowInsets();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // Security Enhancements
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocalAssetUrl(request.getUrl().toString());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (isLocalAssetUrl(url)) {
                    return super.shouldInterceptRequest(view, request);
                }
                return blockedWebResponse();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("document.body.classList.add('native-android');", null);
                updatePrivacyOptionsAvailability();
            }
        });
        webView.addJavascriptInterface(new AndroidAdsBridge(), "AndroidAds");
        registerBackHandling();

        webView.loadUrl("file:///android_asset/public/index.html");
        gatherConsentAndInitializeAds();
    }

    private void registerBackHandling() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBackNavigation();
            }
        });
    }

    private void handleBackNavigation() {
        if (doubleBackToExitPressedOnce) {
            finish();
            return;
        }

        this.doubleBackToExitPressedOnce = true;
        Toast.makeText(this, "Press BACK again to exit", Toast.LENGTH_SHORT).show();

        new Handler(Looper.getMainLooper()).postDelayed(() -> doubleBackToExitPressedOnce = false, 2000);
    }

    @Override
    protected void onDestroy() {
        if (bannerAdView != null) {
            bannerAdView.destroy();
            bannerAdView = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (bannerAdView != null) {
            rootLayout.removeView(bannerAdView);
            bannerAdView.destroy();
            bannerAdView = null;
            bannerHeightPx = 0;
            applySafeAreaMargins();
            loadBannerAd();
        }
    }

    private void configureWindowInsets() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout, (view, insets) -> {
            Insets safeInsets = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            systemInsetTopPx = safeInsets.top;
            systemInsetBottomPx = safeInsets.bottom;
            systemInsetLeftPx = safeInsets.left;
            systemInsetRightPx = safeInsets.right;
            applySafeAreaMargins();
            return insets;
        });
        ViewCompat.requestApplyInsets(rootLayout);
    }

    private void applySafeAreaMargins() {
        if (webView != null) {
            ViewGroup.LayoutParams webParams = webView.getLayoutParams();
            if (webParams instanceof FrameLayout.LayoutParams) {
                FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) webParams;
                params.topMargin = systemInsetTopPx;
                params.bottomMargin = systemInsetBottomPx + bannerHeightPx;
                params.leftMargin = systemInsetLeftPx;
                params.rightMargin = systemInsetRightPx;
                webView.setLayoutParams(params);
            }
        }

        if (bannerAdView != null) {
            ViewGroup.LayoutParams bannerParams = bannerAdView.getLayoutParams();
            if (bannerParams instanceof FrameLayout.LayoutParams) {
                FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) bannerParams;
                params.leftMargin = systemInsetLeftPx;
                params.rightMargin = systemInsetRightPx;
                params.bottomMargin = systemInsetBottomPx;
                bannerAdView.setLayoutParams(params);
            }
        }
    }

    private void gatherConsentAndInitializeAds() {
        consentInformation = UserMessagingPlatform.getConsentInformation(this);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();

        consentInformation.requestConsentInfoUpdate(
                this,
                params,
                () -> {
                    updatePrivacyOptionsAvailability();
                    UserMessagingPlatform.loadAndShowConsentFormIfRequired(
                            this,
                            formError -> {
                                updatePrivacyOptionsAvailability();
                                initializeMobileAdsIfAllowed();
                            });
                    initializeMobileAdsIfAllowed();
                },
                requestConsentError -> {
                    updatePrivacyOptionsAvailability();
                    initializeMobileAdsIfAllowed();
                });
    }

    private void initializeMobileAdsIfAllowed() {
        if (mobileAdsInitialized || consentInformation == null || !consentInformation.canRequestAds()) {
            return;
        }

        mobileAdsInitialized = true;
        new Thread(() -> MobileAds.initialize(this, initializationStatus ->
                mainHandler.post(() -> {
                    loadRewardedAd();
                    loadInterstitialAd();
                    loadBannerAd();
                }))).start();
    }

    private boolean canRequestAds() {
        return mobileAdsInitialized && consentInformation != null && consentInformation.canRequestAds();
    }

    private void updatePrivacyOptionsAvailability() {
        boolean required = consentInformation != null
                && consentInformation.getPrivacyOptionsRequirementStatus()
                == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
        callJs("window.onPrivacyOptionsRequirementChanged && window.onPrivacyOptionsRequirementChanged(" + required + ")");
    }

    private void showPrivacyOptionsForm() {
        mainHandler.post(() -> UserMessagingPlatform.showPrivacyOptionsForm(this, formError -> {
            updatePrivacyOptionsAvailability();
            initializeMobileAdsIfAllowed();
        }));
    }

    private boolean isLocalAssetUrl(String url) {
        return url != null && url.startsWith("file:///android_asset/");
    }

    private WebResourceResponse blockedWebResponse() {
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                403,
                "Blocked",
                Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0]));
    }

    private String currentRewardedUnitId() {
        return BuildConfig.DEBUG ? TEST_REWARDED_UNIT_ID : REAL_REWARDED_UNIT_ID;
    }

    private String currentInterstitialUnitId() {
        return BuildConfig.DEBUG ? TEST_INTERSTITIAL_UNIT_ID : REAL_INTERSTITIAL_UNIT_ID;
    }

    private String currentBannerUnitId() {
        return BuildConfig.DEBUG ? TEST_BANNER_UNIT_ID : REAL_BANNER_UNIT_ID;
    }

    private void loadRewardedAd() {
        if (!canRequestAds()) {
            rewardedAd = null;
            return;
        }

        RewardedAd.load(this, currentRewardedUnitId(), new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(RewardedAd ad) {
                rewardedAd = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError error) {
                rewardedAd = null;
            }
        });
    }

    private void showRewardedHintAd() {
        showRewardedAd(REWARD_HINT);
    }

    private void showRewardedReserveAd() {
        showRewardedAd(REWARD_RESERVE);
    }

    private void showRewardedAd(String rewardType) {
        mainHandler.post(() -> {
            if (activeRewardRequest != null) {
                callRewardFailed(rewardType, "Another rewarded ad is already in progress.");
                return;
            }

            if (!canRequestAds()) {
                callRewardFailed(rewardType, "Ads are not available yet.");
                return;
            }

            if (rewardedAd == null) {
                callRewardFailed(rewardType, "Rewarded ad is still loading. Try again soon.");
                loadRewardedAd();
                return;
            }

            RewardedAd adToShow = rewardedAd;
            rewardedAd = null;
            activeRewardRequest = rewardType;
            final boolean[] rewardEarned = {false};
            adToShow.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    if (!rewardEarned[0]) {
                        callRewardClosed(rewardType);
                    }
                    activeRewardRequest = null;
                    loadRewardedAd();
                }

                @Override
                public void onAdFailedToShowFullScreenContent(AdError adError) {
                    activeRewardRequest = null;
                    callRewardFailed(rewardType, "Rewarded ad could not be shown.");
                    loadRewardedAd();
                }
            });

            adToShow.show(this, rewardItem -> {
                rewardEarned[0] = true;
                callRewardEarned(rewardType);
            });
        });
    }

    private void callRewardEarned(String rewardType) {
        if (REWARD_RESERVE.equals(rewardType)) {
            callJs("window.onRewardedReserveEarned && window.onRewardedReserveEarned()");
            return;
        }
        callJs("window.onRewardedHintEarned && window.onRewardedHintEarned(3)");
    }

    private void callRewardClosed(String rewardType) {
        if (REWARD_RESERVE.equals(rewardType)) {
            callJs("window.onRewardedReserveClosed && window.onRewardedReserveClosed()");
            return;
        }
        callJs("window.onRewardedHintClosed && window.onRewardedHintClosed()");
    }

    private void callRewardFailed(String rewardType, String message) {
        String escapedMessage = message.replace("\\", "\\\\").replace("'", "\\'");
        if (REWARD_RESERVE.equals(rewardType)) {
            callJs("window.onRewardedReserveFailed && window.onRewardedReserveFailed('" + escapedMessage + "')");
            return;
        }
        callJs("window.onRewardedHintFailed && window.onRewardedHintFailed('" + escapedMessage + "')");
    }

    private void loadInterstitialAd() {
        if (!canRequestAds()) {
            interstitialAd = null;
            return;
        }

        InterstitialAd.load(this, currentInterstitialUnitId(), new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(InterstitialAd ad) {
                interstitialAd = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError error) {
                interstitialAd = null;
            }
        });
    }

    private void showInterstitialAd() {
        mainHandler.post(() -> {
            if (!canRequestAds()) {
                callJs("window.onInterstitialFailed && window.onInterstitialFailed('Ads are not available yet. Starting new game.')");
                return;
            }

            if (interstitialAd == null) {
                callJs("window.onInterstitialFailed && window.onInterstitialFailed('Interstitial ad is still loading. Starting new game.')");
                loadInterstitialAd();
                return;
            }

            interstitialAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    interstitialAd = null;
                    callJs("window.onInterstitialClosed && window.onInterstitialClosed()");
                    loadInterstitialAd();
                }

                @Override
                public void onAdFailedToShowFullScreenContent(AdError adError) {
                    interstitialAd = null;
                    callJs("window.onInterstitialFailed && window.onInterstitialFailed('Interstitial ad could not be shown. Starting new game.')");
                    loadInterstitialAd();
                }
            });

            interstitialAd.show(this);
        });
    }

    private void loadBannerAd() {
        if (!canRequestAds() || rootLayout == null || bannerAdView != null) {
            return;
        }

        if (rootLayout.getWidth() == 0) {
            rootLayout.post(this::loadBannerAd);
            return;
        }

        int availableWidthPx = rootLayout.getWidth() - systemInsetLeftPx - systemInsetRightPx;
        float density = getResources().getDisplayMetrics().density;
        int widthDp = Math.max(320, Math.round(availableWidthPx / density));

        AdSize bannerSize = AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp);
        bannerHeightPx = bannerSize.getHeightInPixels(this);

        bannerAdView = new AdView(this);
        bannerAdView.setAdUnitId(currentBannerUnitId());
        bannerAdView.setAdSize(bannerSize);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, bannerHeightPx);
        params.gravity = Gravity.BOTTOM;
        rootLayout.addView(bannerAdView, params);
        applySafeAreaMargins();

        bannerAdView.setAdListener(new AdListener() {
            @Override
            public void onAdLoaded() {
                mainHandler.post(() -> {
                    int loadedHeightPx = Math.max(1, bannerAdView.getAdSize().getHeightInPixels(MainActivity.this));
                    if (bannerHeightPx != loadedHeightPx) {
                        bannerHeightPx = loadedHeightPx;
                        ViewGroup.LayoutParams viewParams = bannerAdView.getLayoutParams();
                        if (viewParams instanceof FrameLayout.LayoutParams) {
                            ((FrameLayout.LayoutParams) viewParams).height = bannerHeightPx;
                            bannerAdView.setLayoutParams(viewParams);
                        }
                    }
                    applySafeAreaMargins();
                    callJs("document.body.classList.add('native-banner-loaded')");
                });
            }
        });
        bannerAdView.loadAd(new AdRequest.Builder().build());
    }

    private void callJs(String js) {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(js, null);
            }
        });
    }

    public class AndroidAdsBridge {
        @JavascriptInterface
        public void showRewardedHintAd() {
            MainActivity.this.showRewardedHintAd();
        }

        @JavascriptInterface
        public void showRewardedReserveAd() {
            MainActivity.this.showRewardedReserveAd();
        }

        @JavascriptInterface
        public void showInterstitialAd() {
            MainActivity.this.showInterstitialAd();
        }

        @JavascriptInterface
        public void showPrivacyOptionsForm() {
            MainActivity.this.showPrivacyOptionsForm();
        }

        @JavascriptInterface
        public void vibrate(int duration) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) {
                int safeDuration = Math.max(1, Math.min(duration, 200));
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(safeDuration, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(safeDuration);
                }
            }
        }
    }
}
