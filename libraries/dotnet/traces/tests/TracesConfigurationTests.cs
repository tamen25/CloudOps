using Xunit;

namespace CloudOps.Otel.Traces.Tests;

public sealed class TracesConfigurationTests
{
    [Fact]
    // Parses string array reads JSON and comma separated values.
    public void ParseStringArrayReadsJsonAndCommaSeparatedValues()
    {
        Assert.Equal(["console", "otel"], TracesConfiguration.ParseStringArray("[\"console\", \" otel \"]", ["fallback"]));
        Assert.Equal(["console", "otel"], TracesConfiguration.ParseStringArray("console, otel", ["fallback"]));
    }

    [Fact]
    // Parses string array copies fallback.
    public void ParseStringArrayCopiesFallback()
    {
        var fallback = new[] { "console" };
        var parsed = TracesConfiguration.ParseStringArray(null, fallback);

        Assert.NotSame(fallback, parsed);
        Assert.Equal(["console"], fallback);
    }

    [Fact]
    // Normalizes endpoint appends traces path.
    public void NormalizeEndpointAppendsTracesPath()
    {
        Assert.Equal("https://collector.example.com/v1/traces", TracesConfiguration.NormalizeEndpoint("https://collector.example.com/"));
        Assert.Equal("https://collector.example.com/v1/traces", TracesConfiguration.NormalizeEndpoint("https://collector.example.com/v1/traces"));
    }

    [Fact]
    // Sampler ratio defaults to one.
    public void SamplerRatioDefaultsToOne()
    {
        using (new EnvironmentScope(new Dictionary<string, string?> { ["TRACEID_RATIO_BASED_SAMPLER"] = null }))
        {
            Assert.Equal(1, TracesConfiguration.SamplerRatio());
        }

        using (new EnvironmentScope(new Dictionary<string, string?> { ["TRACEID_RATIO_BASED_SAMPLER"] = "0.25" }))
        {
            Assert.Equal(0.25, TracesConfiguration.SamplerRatio());
        }
    }

    [Fact]
    public void ReadSsmParametersPrefersConfiguredJsonAndFallsBackToOtelEnvironment()
    {
        using (new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_SSM_PARAMETERS"] = """{"otel":{"trace":{"url":"https://collector.example.com/v1/traces","api_key":"secret"}}}""",
            ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://fallback.example.com",
            ["OTEL_API_KEY"] = "fallback-secret"
        }))
        {
            var parsed = TracesConfiguration.ReadSsmParameters();
            Assert.Equal("https://collector.example.com/v1/traces", parsed.Otel?.Trace?.Url);
            Assert.Equal("secret", parsed.Otel?.Trace?.ApiKey);
        }

        using (new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_SSM_PARAMETERS"] = null,
            ["OTEL_SSM_PARAMETERS_FILE"] = Path.Combine(Path.GetTempPath(), $"missing-{Guid.NewGuid():N}.json"),
            ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://collector.example.com/",
            ["OTEL_API_KEY"] = "direct-secret"
        }))
        {
            var parsed = TracesConfiguration.ReadSsmParameters();
            Assert.Equal("https://collector.example.com/v1/traces", parsed.Otel?.Trace?.Url);
            Assert.Equal("direct-secret", parsed.Otel?.Trace?.ApiKey);
        }
    }

    [Fact]
    public void ReadSsmParametersUsesParamsFileBeforeDirectEnvironment()
    {
        var tempDir = Directory.CreateTempSubdirectory("cloudops-otel-traces-");

        try
        {
            var paramsFile = Path.Combine(tempDir.FullName, "otelExporterParams.json");
            File.WriteAllText(
                paramsFile,
                """{"otel":{"trace":{"url":"https://file.example.com/v1/traces","api_key":"file-secret"}}}""");

            using (new EnvironmentScope(new Dictionary<string, string?>
            {
                ["OTEL_SSM_PARAMETERS_FILE"] = paramsFile,
                ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://fallback.example.com",
                ["OTEL_API_KEY"] = "fallback-secret"
            }))
            {
                var parsed = TracesConfiguration.ReadSsmParameters();
                Assert.Equal("https://file.example.com/v1/traces", parsed.Otel?.Trace?.Url);
                Assert.Equal("file-secret", parsed.Otel?.Trace?.ApiKey);
            }
        }
        finally
        {
            tempDir.Delete(recursive: true);
        }
    }
}
