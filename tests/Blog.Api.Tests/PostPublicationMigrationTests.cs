using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Blog.Api.Tests;

public sealed class PostPublicationMigrationTests
{
    [Fact]
    public async Task Category_hierarchy_migration_preserves_existing_visibility_and_post_links()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:;Foreign Keys=True");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<BlogDbContext>().UseSqlite(connection).Options;
        await using var db = new BlogDbContext(options);
        await db.GetService<IMigrator>().MigrateAsync("20260917050324_AddAdminDrive");

        var ownerId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO AspNetUsers (Id, CreatedAtUtc, EmailConfirmed, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount)
            VALUES ({ownerId}, {now}, 0, 0, 0, 0, 0)
            """);
        var categoryId = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO Categories (Id, Name, Slug, SortOrder, IsVisible, CreatedAtUtc, UpdatedAtUtc)
            VALUES ({categoryId}, 'Public category', 'public-category', 0, 1, {now}, {now}),
                   ({Guid.NewGuid()}, 'Hidden category', 'hidden-category', 0, 0, {now}, {now})
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO Posts (Id, PostNumber, Title, Content, OwnerId, CategoryId, CreatedAtUtc, UpdatedAtUtc)
            VALUES ({Guid.NewGuid()}, 1, 'Existing post', 'Body', {ownerId}, {categoryId}, {now}, {now})
            """);

        await db.Database.MigrateAsync();
        var categories = await db.Categories.ToListAsync();
        Assert.Equal(2, categories.Count);
        Assert.All(categories, category =>
        {
            Assert.Null(category.ParentId);
            Assert.Equal(category.IsVisible, category.IsLocallyVisible);
        });
        Assert.Equal(categoryId, (await db.Posts.SingleAsync()).CategoryId);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT COUNT(*) FROM pragma_foreign_key_list('Categories')
            WHERE "from" = 'ParentId' AND "table" = 'Categories'
            """;
        Assert.Equal(1L, await command.ExecuteScalarAsync());
    }

    [Fact]
    public async Task Existing_posts_keep_content_and_receive_publication_dates()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<BlogDbContext>().UseSqlite(connection).Options;
        await using var db = new BlogDbContext(options);
        await db.GetService<IMigrator>().MigrateAsync("20260903160832_AddPostAssetsAndSiteSettings");

        var owner = new ApplicationUser { UserName = "migration-owner" };
        // Seed the old schema without referencing properties introduced by later migrations.
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO AspNetUsers (Id, UserName, CreatedAtUtc, EmailConfirmed, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) VALUES ({owner.Id}, {owner.UserName}, {owner.CreatedAtUtc}, 0, 0, 0, 0, 0)");
        var created = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        var published = created.AddDays(1);
        foreach (var status in new[] { "Draft", "Published" })
        {
            var number = status == "Draft" ? 1 : 2;
            DateTime? publicationDate = status == "Draft" ? null : published;
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO Posts
                    (Id, PostNumber, Title, Content, Status, OwnerId, CreatedAtUtc, UpdatedAtUtc, PublishedAtUtc)
                VALUES
                    ({Guid.NewGuid()}, {number}, {status}, {"Existing content"}, {status}, {owner.Id}, {created}, {created}, {publicationDate})
                """);
        }

        await db.Database.MigrateAsync();
        var posts = await db.Posts.OrderBy(post => post.PostNumber).ToListAsync();
        Assert.Equal(2, posts.Count);
        Assert.All(posts, post => Assert.Equal("Existing content", post.Content));
        Assert.NotNull(posts[0].PublishedAtUtc);
        Assert.Equal(published, posts[1].PublishedAtUtc);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Posts') WHERE name = 'Status'";
        Assert.Equal(0L, await command.ExecuteScalarAsync());
    }
}
