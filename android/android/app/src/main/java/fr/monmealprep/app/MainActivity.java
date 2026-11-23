package fr.monmealprep.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

// « Partager avec Mon Meal Prep » depuis Instagram, TikTok, YouTube… (Taha, 23/11/2026) : le texte partagé (souvent un lien)
// est donné au site dans son adresse ; la page en fait un plat (app.js, traiterPartage).
public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://tahabar19.github.io/meal-prep/";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        partage(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        partage(intent);
    }

    private void partage(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String texte = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (texte == null || texte.trim().isEmpty()) return;
        String sujet = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        final String adresse = SITE + "?texte=" + Uri.encode(texte.trim())
                + (sujet != null && !sujet.trim().isEmpty() ? "&titre=" + Uri.encode(sujet.trim()) : "") + "#/catalogue";
        setIntent(new Intent(Intent.ACTION_MAIN));               // une rotation ne repartage pas
        if (getBridge() == null) return;
        final WebView vue = getBridge().getWebView();
        if (vue != null) vue.post(() -> vue.loadUrl(adresse));
    }
}
