using Xunit;

namespace CloudOps.Otel.Traces.Tests;

public sealed class RuntimeResourceAttributesTests
{
    [Fact]
    public void ServiceNameEnvironmentOverridesResourceAttributes()
    {
        using var env = new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_RESOURCE_ATTRIBUTES"] = "service.name=from-resource,deployment.environment=dev",
            ["OTEL_SERVICE_NAME"] = "from-env"
        });

        var attributes = RuntimeResourceAttributes.Create();

        Assert.Equal("from-env", attributes["service.name"]);
        Assert.Equal("dev", attributes["deployment.environment"]);
        Assert.Equal("0.1.0", attributes["cloudops-trace-ver"]);
    }

    [Fact]
    public void LambdaAttributesAreDetected()
    {
        using var env = new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_RESOURCE_ATTRIBUTES"] = null,
            ["OTEL_SERVICE_NAME"] = null,
            ["AWS_LAMBDA_FUNCTION_NAME"] = "orders-handler"
        });

        var attributes = RuntimeResourceAttributes.Create();

        Assert.Equal("orders-handler", attributes["service.name"]);
        Assert.Equal("aws_lambda", attributes["cloud.platform"]);
        Assert.Equal("orders-handler", attributes["faas.name"]);
    }
}
