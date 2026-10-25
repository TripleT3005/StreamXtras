use std::time::Duration;

// Constants
const TIMEOUT: Duration = Duration::from_secs(15);

// Types
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

pub trait TwitchHttp: Send + Sync {
    fn post_form(&self, url: &str, form: &[(&str, &str)]) -> Result<HttpResponse, String>;
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, String>;
    fn post_json(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &str,
    ) -> Result<HttpResponse, String>;
}

// Client
pub struct UreqHttp {
    agent: ureq::Agent,
}

impl UreqHttp {
    pub fn new() -> Self {
        let config = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(TIMEOUT))
            .build();
        Self {
            agent: config.into(),
        }
    }
}

impl TwitchHttp for UreqHttp {
    fn post_form(&self, url: &str, form: &[(&str, &str)]) -> Result<HttpResponse, String> {
        let response = self
            .agent
            .post(url)
            .send_form(form.iter().copied())
            .map_err(|error| error.to_string())?;
        read_response(response)
    }

    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, String> {
        let request = headers
            .iter()
            .fold(self.agent.get(url), |request, (name, value)| {
                request.header(*name, *value)
            });
        read_response(request.call().map_err(|error| error.to_string())?)
    }

    fn post_json(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &str,
    ) -> Result<HttpResponse, String> {
        let request = headers
            .iter()
            .fold(self.agent.post(url), |request, (name, value)| {
                request.header(*name, *value)
            })
            .header("Content-Type", "application/json");
        read_response(request.send(body).map_err(|error| error.to_string())?)
    }
}

fn read_response(mut response: ureq::http::Response<ureq::Body>) -> Result<HttpResponse, String> {
    let status = response.status().as_u16();
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|error| error.to_string())?;
    Ok(HttpResponse { status, body })
}
