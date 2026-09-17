using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Data;

public sealed class BlogDbContext(DbContextOptions<BlogDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<DriveEntry> DriveEntries => Set<DriveEntry>();
    public DbSet<SiteInstallation> SiteInstallations => Set<SiteInstallation>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<PostAsset> PostAssets => Set<PostAsset>();
    public DbSet<SiteSetting> SiteSettings => Set<SiteSetting>();
    public DbSet<SlideWorkspace> SlideWorkspaces => Set<SlideWorkspace>();
    public DbSet<PostCounter> PostCounters => Set<PostCounter>();
    public DbSet<CommunityInvite> CommunityInvites => Set<CommunityInvite>();
    public DbSet<PostComment> PostComments => Set<PostComment>();
    public DbSet<PostBookmark> PostBookmarks => Set<PostBookmark>();
    public DbSet<ContentReport> ContentReports => Set<ContentReport>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

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

        builder.Entity<DriveEntry>(entity =>
        {
            entity.Property(item => item.Name).HasMaxLength(200);
            entity.Property(item => item.NameKey).HasMaxLength(200);
            entity.Property(item => item.Revision).IsConcurrencyToken();
            entity.HasIndex(item => new { item.ParentId, item.NameKey }).IsUnique().HasFilter("DeletedAtUtc IS NULL");
            entity.HasIndex(item => item.DeletedAtUtc);
        });
        builder.Entity<Post>(entity =>
        {
            entity.HasKey(post => post.Id);
            entity.HasQueryFilter(post => post.DeletedAtUtc == null);
            entity.HasIndex(post => post.PostNumber).IsUnique();
            entity.Property(post => post.Revision).IsConcurrencyToken().HasDefaultValue(1L);
            entity.HasIndex(post => new { post.DeletedAtUtc, post.CategoryId, post.PostNumber });
            entity.HasIndex(post => new { post.DeletedAtUtc, post.Priority, post.PostNumber });
            entity.Property(post => post.Title).HasMaxLength(240);
            entity.Property(post => post.Description).HasMaxLength(500);
            entity.Property(post => post.Visibility).HasMaxLength(24).HasDefaultValue(PostVisibility.Public);
            entity.Property(post => post.AccessCodeHash).HasMaxLength(512);
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

        builder.Entity<PostCounter>(entity =>
        {
            entity.HasKey(counter => counter.Id);
            entity.Property(counter => counter.Id).ValueGeneratedNever();
        });
        builder.Entity<CommunityInvite>().HasIndex(item => item.TokenHash).IsUnique();
        builder.Entity<CommunityInvite>().Property(item => item.TokenHash).HasMaxLength(64);
        builder.Entity<PostComment>(entity =>
        {
            entity.HasIndex(item => new { item.PostId, item.CreatedAtUtc, item.Id });
            entity.Property(item => item.Content).HasMaxLength(10000);
            entity.Property(item => item.Revision).IsConcurrencyToken();
            entity.HasOne<Post>().WithMany().HasForeignKey(item => item.PostId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Author).WithMany().HasForeignKey(item => item.AuthorId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<PostComment>().WithMany().HasForeignKey(item => item.ParentId).OnDelete(DeleteBehavior.Cascade);
        });
        builder.Entity<PostBookmark>(entity =>
        {
            entity.HasKey(item => new { item.UserId, item.PostId });
            entity.HasOne<Post>().WithMany().HasForeignKey(item => item.PostId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(item => item.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        builder.Entity<ContentReport>(entity =>
        {
            entity.HasIndex(item => new { item.ResolvedAtUtc, item.CreatedAtUtc });
            entity.Property(item => item.Reason).HasMaxLength(1000);
            entity.Property(item => item.Resolution).HasMaxLength(1000);
            entity.HasOne(item => item.Post).WithMany().HasForeignKey(item => item.PostId).OnDelete(DeleteBehavior.Cascade);
        });
        builder.Entity<AuditEvent>(entity =>
        {
            entity.HasIndex(item => item.CreatedAtUtc);
            entity.Property(item => item.Action).HasMaxLength(80);
            entity.Property(item => item.Target).HasMaxLength(100);
        });
        builder.Entity<SlideWorkspace>(entity =>
        {
            entity.HasKey(workspace => workspace.Id);
            entity.HasIndex(workspace => new { workspace.UserId, workspace.PostId, workspace.SourceHash, workspace.Mode }).IsUnique();
            entity.Property(workspace => workspace.SourceHash).HasMaxLength(64);
            entity.Property(workspace => workspace.Mode).HasMaxLength(8);
            entity.Property(workspace => workspace.Revision).IsConcurrencyToken();
            entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(workspace => workspace.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Post>().WithMany().HasForeignKey(workspace => workspace.PostId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
