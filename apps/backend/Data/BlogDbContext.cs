using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Data;

public sealed class BlogDbContext(DbContextOptions<BlogDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<SiteInstallation> SiteInstallations => Set<SiteInstallation>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<PostAsset> PostAssets => Set<PostAsset>();
    public DbSet<SiteSetting> SiteSettings => Set<SiteSetting>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<SiteInstallation>(entity =>
        {
            entity.HasKey(installation => installation.Id);
            entity.Property(installation => installation.Id).ValueGeneratedNever();
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(installation => installation.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasData(new SiteInstallation
            {
                Id = SiteInstallation.SingletonId,
                IsInitialized = false,
                IsInitializationInProgress = false,
            });
        });

        builder.Entity<Post>(entity =>
        {
            entity.HasKey(post => post.Id);
            entity.HasIndex(post => post.PostNumber).IsUnique();
            entity.Property(post => post.Title).HasMaxLength(240);
            entity.Property(post => post.Description).HasMaxLength(500);
            entity.Property(post => post.Status).HasMaxLength(16);
            entity.HasOne(post => post.Category)
                .WithMany(category => category.Posts)
                .HasForeignKey(post => post.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(post => post.Owner)
                .WithMany()
                .HasForeignKey(post => post.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Category>(entity =>
        {
            entity.HasKey(category => category.Id);
            entity.HasIndex(category => category.Slug).IsUnique();
            entity.Property(category => category.Name).HasMaxLength(80);
            entity.Property(category => category.Slug).HasMaxLength(80);
            entity.Property(category => category.Description).HasMaxLength(300);
        });

        builder.Entity<PostAsset>(entity =>
        {
            entity.HasKey(asset => asset.Id);
            entity.HasIndex(asset => new { asset.PostId, asset.Name }).IsUnique();
            entity.Property(asset => asset.Name).HasMaxLength(120);
            entity.Property(asset => asset.Extension).HasMaxLength(8);
            entity.Property(asset => asset.StorageFileName).HasMaxLength(80);
            entity.Property(asset => asset.ContentType).HasMaxLength(64);
            entity.HasOne(asset => asset.Post)
                .WithMany(post => post.Assets)
                .HasForeignKey(asset => asset.PostId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<SiteSetting>(entity =>
        {
            entity.HasKey(setting => setting.Id);
            entity.HasIndex(setting => setting.Key).IsUnique();
            entity.Property(setting => setting.Key).HasMaxLength(128);
            entity.Property(setting => setting.Value).HasMaxLength(65_536);
        });
    }
}
