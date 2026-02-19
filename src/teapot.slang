struct Camera
{
    float4 position;
    float4 targetPos;
    float4x4 view;
    float4x4 projection;
    float4x4 viewInverse;
    float4x4 projectionInverse;
};

struct ExampleControls
{
    float3 lightColor;
    float3 lightDirection;
    float3 ambientColor;
    float ambientStrength;
    float specularExponent;
};

ConstantBuffer<Camera> camera;
ConstantBuffer<ExampleControls> controls;

struct VertexInput
{
    float3 position : POSITION;
    float3 normal   : NORMAL;
};

struct VertexOutput
{
    float3 worldPosition;
    float3 worldNormal;
    float4 clipPosition : SV_Position;
};

[shader("vertex")]
VertexOutput vertexMain(VertexInput input)
{
    VertexOutput output;
    output.worldPosition = input.position;
    output.worldNormal = input.normal;

    float4 worldPos = float4(input.position, 1.0);
    output.clipPosition = mul(camera.projection, mul(camera.view, worldPos));

    return output;
}

[shader("fragment")]
float4 fragmentMain(VertexOutput input) : SV_Target
{
    float3 lColor = normalize(controls.lightColor);
    float3 lightDir = normalize(controls.lightDirection);
    float3 ambColor = controls.ambientColor;
    float ambStr = controls.ambientStrength;
    float specExp = controls.specularExponent;

    float3 ambient = ambColor * ambStr;

    float cosTheta = dot(input.worldNormal, lightDir);
    float3 diffuse = lColor * max(0.0, cosTheta);

    float3 reflectDir = reflect(-lightDir, input.worldNormal);
    float3 viewDir = normalize(camera.position.xyz - input.worldPosition);
    float specFactor = pow(max(0.0, dot(reflectDir, viewDir)), specExp);
    float3 specular = lColor * specFactor;

    float3 color = ambient + diffuse + specular;
    return float4(color, 1.0);
}
