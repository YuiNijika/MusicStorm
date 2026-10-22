use reqwest::Url;
use std::net::IpAddr;

pub fn validate_remote_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "远程地址无效".to_string())?;
    if url.scheme() != "https" {
        return Err("仅支持 HTTPS 远程地址".into());
    }
    if url.username() != "" || url.password().is_some() {
        return Err("远程地址不能包含登录凭据".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "远程地址缺少主机名".to_string())?
        .to_ascii_lowercase();
    let ip_host = host.trim_matches(['[', ']']);
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host == "0.0.0.0"
    {
        return Err("不允许访问本机地址".into());
    }
    if let Ok(ip) = ip_host.parse::<IpAddr>() {
        let blocked = ip.is_loopback()
            || ip.is_unspecified()
            || ip.is_multicast()
            || match ip {
                IpAddr::V4(value) => value.is_private() || value.is_link_local(),
                IpAddr::V6(value) => value.is_unique_local() || value.is_unicast_link_local(),
            };
        if blocked {
            return Err("不允许访问内网地址".into());
        }
    }
    Ok(url)
}

pub fn redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 3 {
            return attempt.stop();
        }
        match validate_remote_url(attempt.url().as_str()) {
            Ok(_) => attempt.follow(),
            Err(_) => attempt.stop(),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::validate_remote_url;

    #[test]
    fn rejects_insecure_and_private_addresses() {
        assert!(validate_remote_url("http://example.com/file").is_err());
        assert!(validate_remote_url("https://127.0.0.1/file").is_err());
        assert!(validate_remote_url("https://localhost/file").is_err());
        assert!(validate_remote_url("https://example.com:8443/file").is_ok());
        assert!(validate_remote_url("https://[::1]/file").is_err());
    }

    #[test]
    fn accepts_public_https_address() {
        assert!(validate_remote_url("https://example.com/file").is_ok());
    }
}
