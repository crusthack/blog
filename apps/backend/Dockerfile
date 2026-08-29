FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY apps/backend/Blog.Api.csproj apps/backend/
RUN dotnet restore apps/backend/Blog.Api.csproj

COPY apps/backend/ apps/backend/
RUN dotnet publish apps/backend/Blog.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/runtime \
    && chown -R $APP_UID:$APP_UID /app/runtime

EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Blog.Api.dll"]
