package vn.bvtls.diemdanh;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** Điểm danh – Từ BV TLS – by Dr Huy - BV TLS */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AntiFakePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
