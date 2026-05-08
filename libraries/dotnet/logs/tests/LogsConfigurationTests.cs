using Xunit;

namespace CloudOps.Otel.Logs.Tests;

public sealed class LogsConfigurationTests
{
    [Fact]
    public void ParseStringArrayReadsJsonAndCommaSeparatedValues()
    {
        Assert.Equal(["console", "otel"], LogsConfiguration.ParseStringArray("[\"console\", \" otel \"]", ["fallback"]));
        Assert.Equal(["console", "otel"], LogsConfiguration.ParseStringArray("console, otel", ["fallback"]));
    }

    [Fact]
    public void ParseStringArrayCopiesFallback()
    {
        var fallback = new[] { "console" };
        var parsed = LogsConfiguration.ParseStringArray(null, fallback);

        Assert.NotSame(fallback, parsed);
        Assert.Equal(["console"], fallback);
    }

    [Fact]
    public void ReadSsmParametersPrefersConfiguredJsonAndFallsBackToOtelEnvironment()
    {
        using (new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_SSM_PARAMETERS"] = """{"otel":{"logs":{"url":"https://collector.example.com/v1/logs","api_key":"secret"}}}""",
            ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://fallback.example.com",
            ["OTEL_API_KEY"] = "fallback-secret"
        }))
        {
            var parsed = LogsConfiguration.ReadSsmParameters();
            Assert.Equal("https://collector.example.com/v1/logs", parsed.Otel?.Logs?.Url);
            Assert.Equal("secret", parsed.Otel?.Logs?.ApiKey);
        }

        using (new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_SSM_PARAMETERS"] = null,
            ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://collector.example.com/",
            ["OTEL_API_KEY"] = "direct-secret"
        }))
        {
            var parsed = LogsConfiguration.ReadSsmParameters();
            Assert.Equal("https://collector.example.com/v1/logs", parsed.Otel?.Logs?.Url);
            Assert.Equal("direct-secret", parsed.Otel?.Logs?.ApiKey);
        }
    }
}
