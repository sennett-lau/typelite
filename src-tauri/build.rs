fn main() {
    #[cfg(target_os = "windows")]
    println!(
        "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
    );

    #[cfg(target_os = "macos")]
    link_clang_runtime();

    tauri_build::build()
}

/// Plan `quick-speech-setup`: whisper.cpp's Metal code uses Objective-C `@available(...)` checks.
/// When the app is built for an older macOS than the one it is built on (the release bundle targets
/// `minimumSystemVersion`), clang turns those checks into calls to
/// `__isPlatformVersionAtLeast`, which lives in clang's runtime library `libclang_rt.osx.a`.
/// Rust links with `-nodefaultlibs`, so that library is added here by hand.
#[cfg(target_os = "macos")]
fn link_clang_runtime() {
    let output = std::process::Command::new("cc")
        .arg("--print-runtime-dir")
        .output();
    let Ok(output) = output else {
        println!("cargo:warning=could not ask cc for the clang runtime directory");
        return;
    };
    let dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if dir.is_empty()
        || !std::path::Path::new(&dir)
            .join("libclang_rt.osx.a")
            .is_file()
    {
        println!("cargo:warning=libclang_rt.osx.a not found in {dir:?}");
        return;
    }
    println!("cargo:rustc-link-search=native={dir}");
    println!("cargo:rustc-link-lib=static=clang_rt.osx");
}
