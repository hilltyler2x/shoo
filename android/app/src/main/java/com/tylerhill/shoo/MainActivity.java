package com.tylerhill.shoo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShooNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
