package vn.bvtls.diemdanh;

import android.app.AppOpsManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.List;

/**
 * Chặn phần mềm giả lập vị trí (fake GPS).
 * Từ BV TLS – by Dr Huy - BV TLS
 *
 * activeMock    : ứng dụng đang được chọn làm "Ứng dụng vị trí mô phỏng" (đang fake GPS)
 * installedMock : ứng dụng người dùng có quyền ACCESS_MOCK_LOCATION (app fake GPS đã cài)
 * devOptions    : Tùy chọn nhà phát triển đang bật
 * rooted        : máy có dấu hiệu đã root
 */
@CapacitorPlugin(name = "AntiFake")
public class AntiFakePlugin extends Plugin {

    private static final String MOCK_PERMISSION = "android.permission.ACCESS_MOCK_LOCATION";

    @PluginMethod
    public void check(PluginCall call) {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        JSArray active = new JSArray();
        JSArray installed = new JSArray();

        AppOpsManager appOps = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        List<PackageInfo> pkgs;
        try {
            pkgs = pm.getInstalledPackages(PackageManager.GET_PERMISSIONS);
        } catch (Exception e) {
            call.reject("Không đọc được danh sách ứng dụng");
            return;
        }
        for (PackageInfo p : pkgs) {
            if (p.requestedPermissions == null || p.applicationInfo == null) continue;
            if (p.packageName.equals(ctx.getPackageName())) continue;
            boolean wantsMock = false;
            for (String perm : p.requestedPermissions) {
                if (MOCK_PERMISSION.equals(perm)) { wantsMock = true; break; }
            }
            if (!wantsMock) continue;
            boolean system = (p.applicationInfo.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0;
            if (system) continue;
            String label = String.valueOf(pm.getApplicationLabel(p.applicationInfo)) + " (" + p.packageName + ")";
            installed.put(label);
            if (appOps != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    int mode;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        mode = appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_MOCK_LOCATION, p.applicationInfo.uid, p.packageName);
                    } else {
                        mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_MOCK_LOCATION, p.applicationInfo.uid, p.packageName);
                    }
                    if (mode == AppOpsManager.MODE_ALLOWED) active.put(label);
                } catch (Exception ignored) { }
            }
        }

        ContentResolver cr = ctx.getContentResolver();
        boolean devOptions = false;
        try { devOptions = Settings.Global.getInt(cr, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1; } catch (Exception ignored) { }
        // Android 5 trở về trước: công tắc "Cho phép vị trí mô phỏng"
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            try {
                if ("1".equals(Settings.Secure.getString(cr, "mock_location"))) active.put("Cho phép vị trí mô phỏng (hệ thống)");
            } catch (Exception ignored) { }
        }

        JSObject ret = new JSObject();
        ret.put("activeMock", active);
        ret.put("installedMock", installed);
        ret.put("devOptions", devOptions);
        ret.put("rooted", isRooted());
        ret.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    private boolean isRooted() {
        String tags = Build.TAGS;
        if (tags != null && tags.contains("test-keys")) return true;
        String[] paths = { "/system/app/Superuser.apk", "/sbin/su", "/system/bin/su", "/system/xbin/su", "/data/local/xbin/su",
                "/data/local/bin/su", "/system/sd/xbin/su", "/system/bin/failsafe/su", "/data/local/su", "/su/bin/su",
                "/system/xbin/daemonsu", "/data/adb/magisk" };
        for (String p : paths) {
            try { if (new File(p).exists()) return true; } catch (Exception ignored) { }
        }
        return false;
    }
}
